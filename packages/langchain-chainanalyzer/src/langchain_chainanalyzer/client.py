"""Async client for the ChainAnalyzer AML API (x402 pay-per-call or API key).

Auth (constructor arguments first, then environment variables; never hard-code secrets):

* ``api_key`` / ``CHAINANALYZER_API_KEY=tfk_...`` -> ``X-API-Key`` header, billed to your plan.
* ``private_key`` / ``X402_PRIVATE_KEY=0x...``    -> pays each call in USDC on Base mainnet via x402
  (EIP-3009, settled by the facilitator). Use a dedicated wallet holding only a small USDC float.
  Requires the ``x402`` extra: ``pip install "langchain-chainanalyzer[x402]"``.

If both are set the API key wins.

Safety rails:

* ``max_usd_per_call`` / ``CHAINANALYZER_MAX_USD_PER_CALL`` (default ``1.00``) is enforced by the x402
  SDK's spend controls before anything is signed.
* ``dry_run`` / ``CHAINANALYZER_DRY_RUN=1`` stops right before signing and returns the quoted price.
"""

from __future__ import annotations

import os
from typing import Any, Optional
from urllib.parse import quote

import httpx

from langchain_chainanalyzer._version import __version__

DEFAULT_BASE_URL = "https://chain-analyzer.com"
BASE_MAINNET = "eip155:8453"  # CAIP-2 id of Base mainnet

#: x402 list prices in USDC. Live list: https://chain-analyzer.com/x402/api/discover
PRICES_USD = {
    "risk-score": "1.00",
    "sanctions": "0.50",
    "hack-exposure": "0.50",
    "freeze-status": "0.10",
    "hack-exposure-batch": "5.00",
}

SUPPORTED_CHAINS = (
    "bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum",
    "optimism", "avalanche", "solana", "kaia", "tron", "xrp",
)

DISCLAIMER = (
    "Automated screening signal, not a legal determination. Hack exposure is a lower-bound taint over "
    "published incidents only; absence of a match or of a freeze is not proof that funds are clean. "
    "Keep a human in the loop for crediting, freezing or reporting decisions."
)


class ChainAnalyzerError(RuntimeError):
    """Raised for non-2xx responses, missing credentials or payment failures."""


class ChainAnalyzerClient:
    """Thin async client. One instance per event loop (it keeps an ``httpx.AsyncClient``)."""

    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        private_key: Optional[str] = None,
        max_usd_per_call: Optional[str] = None,
        dry_run: Optional[bool] = None,
        timeout: float = 60.0,
    ) -> None:
        self.base_url = (base_url or os.getenv("CHAINANALYZER_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self._api_key = api_key or os.getenv("CHAINANALYZER_API_KEY")
        self._private_key = private_key or os.getenv("X402_PRIVATE_KEY")
        self.max_usd_per_call = max_usd_per_call or os.getenv("CHAINANALYZER_MAX_USD_PER_CALL", "1.00")
        self.dry_run = dry_run if dry_run is not None else os.getenv("CHAINANALYZER_DRY_RUN") == "1"
        self.timeout = timeout
        self._http: Optional[httpx.AsyncClient] = None
        self._quoted: Optional[dict[str, Any]] = None
        if not self._api_key and not self._private_key:
            raise ChainAnalyzerError(
                "Set CHAINANALYZER_API_KEY (subscription) or X402_PRIVATE_KEY (pay per call in USDC on Base)."
            )

    @property
    def mode(self) -> str:
        return "api_key" if self._api_key else "x402"

    def clone(self) -> "ChainAnalyzerClient":
        """A fresh client with the same settings (for use on another event loop)."""
        return ChainAnalyzerClient(
            base_url=self.base_url,
            api_key=self._api_key,
            private_key=None if self._api_key else self._private_key,
            max_usd_per_call=self.max_usd_per_call,
            dry_run=self.dry_run,
            timeout=self.timeout,
        )

    def _client(self) -> httpx.AsyncClient:
        if self._http is not None:
            return self._http
        headers = {"Accept": "application/json", "User-Agent": f"langchain-chainanalyzer/{__version__}"}
        if self._api_key:
            headers["X-API-Key"] = self._api_key
            self._http = httpx.AsyncClient(headers=headers, timeout=self.timeout)
            return self._http

        try:  # x402 mode: imported lazily so API-key users don't need the extras.
            from eth_account import Account
            from x402 import x402Client
            from x402.http.clients import x402HttpxClient
            from x402.mechanisms.evm.exact import register_exact_evm_client
            from x402.mechanisms.evm.signers import EthAccountSigner
            from x402.schemas.hooks import AbortResult
        except ImportError as exc:  # pragma: no cover - depends on the extra
            raise ChainAnalyzerError(
                'x402 mode needs the extra: pip install "langchain-chainanalyzer[x402]"'
            ) from exc

        payer = x402Client()
        # Only Base mainnet is registered, so the Solana option in the 402 response is ignored.
        register_exact_evm_client(payer, EthAccountSigner(Account.from_key(self._private_key)), networks=BASE_MAINNET)
        payer.set_spend_controls({"max_amount_per_payment": f"${self.max_usd_per_call}"})
        if self.dry_run:
            def _stop_before_signing(ctx: Any) -> Any:
                req = ctx.selected_requirements
                self._quoted = {
                    "network": req.network,
                    "amount_usdc": int(req.amount) / 1_000_000,
                    "pay_to": req.pay_to,
                }
                return AbortResult(reason="dry_run")

            payer.on_before_payment_creation(_stop_before_signing)
        self._http = x402HttpxClient(payer, headers=headers, timeout=self.timeout)
        return self._http

    async def _request(
        self, method: str, path: str, params: Optional[dict[str, Any]] = None, json_body: Any = None
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        query = {k: v for k, v in (params or {}).items() if v not in (None, "")}
        self._quoted = None
        try:
            resp = await self._client().request(method, url, params=query, json=json_body)
        except ChainAnalyzerError:
            raise
        except Exception as exc:  # x402 PaymentError, network errors
            if self._quoted is not None:
                return {"dry_run": True, "would_pay": self._quoted, "url": url}
            raise ChainAnalyzerError(f"request failed: {exc}") from exc
        if resp.status_code == 402:
            raise ChainAnalyzerError(
                "402 Payment Required: payment was not accepted (check USDC balance on Base, "
                "max_usd_per_call, or your API key plan)."
            )
        if resp.status_code >= 400:
            raise ChainAnalyzerError(f"HTTP {resp.status_code}: {resp.text[:500]}")
        return resp.json()

    @staticmethod
    def _addr(address: str) -> str:
        return quote(address, safe="")

    async def sanctions(self, address: str, chain: Optional[str] = None) -> dict[str, Any]:
        """$0.50 — sanctions lists (OFAC, EU, UK, UN, JFSA) and ScamDB."""
        return await self._request("GET", f"/x402/api/address/{self._addr(address)}/sanctions", {"chain": chain})

    async def hack_exposure(self, address: str, chain: Optional[str] = None) -> dict[str, Any]:
        """$0.50 — connection to a known (published) hack."""
        return await self._request("GET", f"/x402/api/address/{self._addr(address)}/hack-exposure", {"chain": chain})

    async def freeze_status(self, address: str, chain: Optional[str] = None) -> dict[str, Any]:
        """$0.10 — frozen / blacklisted by a stablecoin issuer?"""
        return await self._request("GET", f"/x402/api/address/{self._addr(address)}/freeze-status", {"chain": chain})

    async def risk_score(
        self, address: str, chain: Optional[str] = None, lang: Optional[str] = None
    ) -> dict[str, Any]:
        """$1.00 — full AML risk score with free hack-exposure and freeze-status summaries."""
        return await self._request(
            "GET", f"/x402/api/address/{self._addr(address)}/risk-score", {"chain": chain, "lang": lang}
        )

    async def hack_exposure_batch(self, addresses: list[str], chain: Optional[str] = None) -> dict[str, Any]:
        """$5.00 per call — known-hack exposure for up to 50 addresses."""
        body: dict[str, Any] = {"addresses": addresses}
        if chain:
            body["chain"] = chain
        return await self._request("POST", "/x402/api/hack-exposure/batch", json_body=body)

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None
