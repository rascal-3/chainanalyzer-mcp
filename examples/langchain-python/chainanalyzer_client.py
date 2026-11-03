"""Minimal async client for the ChainAnalyzer AML API (x402 or API key).

Auth modes (picked from environment variables, never hard-coded):

* ``CHAINANALYZER_API_KEY=tfk_...``  -> sends ``X-API-Key``; billed to your
  ChainAnalyzer subscription, no on-chain payment.
* ``X402_PRIVATE_KEY=0x...``         -> pays each call in USDC on Base mainnet
  via the x402 protocol (EIP-3009 transferWithAuthorization, settled by the
  facilitator). Use a dedicated hot wallet that only holds a small USDC float.

If both are set, the API key wins (no per-call USDC spend).

Safety rails:

* ``CHAINANALYZER_MAX_USD_PER_CALL`` (default ``1.00``) is enforced by the x402
  SDK's spend controls before anything is signed.
* ``CHAINANALYZER_DRY_RUN=1`` stops right before signing and returns the price
  the server asked for, so you can wire up an agent without spending anything.
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import quote

import httpx

DEFAULT_BASE_URL = "https://chain-analyzer.com"
BASE_MAINNET = "eip155:8453"  # CAIP-2 id of Base mainnet

# List prices (USDC) from https://chain-analyzer.com/x402/api/discover
PRICES_USD = {
    "risk-score": "1.00",
    "sanctions": "0.50",
    "hack-exposure": "0.50",
}

SUPPORTED_CHAINS = (
    "bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum",
    "optimism", "avalanche", "solana", "kaia", "tron", "xrp",
)

DISCLAIMER = (
    "Automated screening signal, not a legal determination. Hack exposure is a "
    "lower-bound taint over published incidents only; absence of a match is not "
    "proof that funds are clean. Keep a human in the loop for crediting, "
    "freezing or reporting decisions."
)


class ChainAnalyzerError(RuntimeError):
    """Raised for non-2xx responses or payment failures."""


class ChainAnalyzerClient:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        private_key: str | None = None,
        max_usd_per_call: str | None = None,
        dry_run: bool | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.base_url = (base_url or os.getenv("CHAINANALYZER_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self._api_key = api_key or os.getenv("CHAINANALYZER_API_KEY")
        self._private_key = private_key or os.getenv("X402_PRIVATE_KEY")
        self.max_usd_per_call = max_usd_per_call or os.getenv("CHAINANALYZER_MAX_USD_PER_CALL", "1.00")
        self.dry_run = dry_run if dry_run is not None else os.getenv("CHAINANALYZER_DRY_RUN") == "1"
        self.timeout = timeout
        self._http: httpx.AsyncClient | None = None
        self._quoted: dict[str, Any] | None = None

        if not self._api_key and not self._private_key:
            raise ChainAnalyzerError(
                "Set CHAINANALYZER_API_KEY (subscription) or X402_PRIVATE_KEY (pay per call in USDC on Base)."
            )

    @property
    def mode(self) -> str:
        return "api_key" if self._api_key else "x402"

    def _client(self) -> httpx.AsyncClient:
        if self._http is not None:
            return self._http
        headers = {"Accept": "application/json", "User-Agent": "chainanalyzer-examples/0.1"}
        if self._api_key:
            headers["X-API-Key"] = self._api_key
            self._http = httpx.AsyncClient(headers=headers, timeout=self.timeout)
            return self._http

        # x402 mode: imported lazily so API-key users don't need the extras.
        from eth_account import Account
        from x402 import x402Client
        from x402.http.clients import x402HttpxClient
        from x402.mechanisms.evm.exact import register_exact_evm_client
        from x402.mechanisms.evm.signers import EthAccountSigner
        from x402.schemas.hooks import AbortResult

        payer = x402Client()
        # Only Base mainnet is registered, so the Solana option in the 402 is ignored.
        register_exact_evm_client(payer, EthAccountSigner(Account.from_key(self._private_key)), networks=BASE_MAINNET)
        payer.set_spend_controls({"max_amount_per_payment": f"${self.max_usd_per_call}"})

        if self.dry_run:
            def _stop_before_signing(ctx: Any) -> AbortResult:
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

    async def get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        query = {k: v for k, v in (params or {}).items() if v not in (None, "")}
        self._quoted = None
        try:
            resp = await self._client().get(url, params=query)
        except Exception as exc:  # x402 PaymentError, network errors
            if self._quoted is not None:
                return {"dry_run": True, "would_pay": self._quoted, "url": url}
            raise ChainAnalyzerError(f"request failed: {exc}") from exc

        if resp.status_code == 402:
            raise ChainAnalyzerError(
                "402 Payment Required: payment was not accepted (check USDC balance on Base, "
                "CHAINANALYZER_MAX_USD_PER_CALL, or your API key plan)."
            )
        if resp.status_code >= 400:
            raise ChainAnalyzerError(f"HTTP {resp.status_code}: {resp.text[:500]}")
        return resp.json()

    # ── the three screening calls ─────────────────────────────────────
    async def sanctions(self, address: str, chain: str | None = None) -> dict[str, Any]:
        return await self.get(f"/x402/api/address/{quote(address, safe='')}/sanctions", {"chain": chain})

    async def risk_score(self, address: str, chain: str | None = None, lang: str | None = None) -> dict[str, Any]:
        return await self.get(
            f"/x402/api/address/{quote(address, safe='')}/risk-score", {"chain": chain, "lang": lang}
        )

    async def hack_exposure(self, address: str, chain: str | None = None) -> dict[str, Any]:
        return await self.get(f"/x402/api/address/{quote(address, safe='')}/hack-exposure", {"chain": chain})

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None
