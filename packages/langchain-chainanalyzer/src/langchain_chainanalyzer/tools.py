"""LangChain tools for ChainAnalyzer AML screening.

    from langchain_chainanalyzer import ChainAnalyzerToolkit
    tools = ChainAnalyzerToolkit().get_tools()   # reads auth from the environment

Every tool supports ``ainvoke`` (preferred) and ``invoke``. In x402 mode each call costs USDC:
sanctions $0.50, hack exposure $0.50, freeze status $0.10, risk score $1.00, batch $5.00 (opt-in).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Awaitable, Callable, Literal, Optional

from langchain_core.tools import BaseTool, BaseToolkit, StructuredTool
from pydantic import BaseModel, ConfigDict, Field

from langchain_chainanalyzer.client import DISCLAIMER, PRICES_USD, ChainAnalyzerClient, ChainAnalyzerError

Chain = Literal[
    "bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum",
    "optimism", "avalanche", "solana", "kaia", "tron", "xrp",
]
HackChain = Literal[
    "bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum",
    "optimism", "avalanche", "solana", "kaia", "tron",
]


class AddressInput(BaseModel):
    address: str = Field(description="Blockchain address, exactly as received (do not lowercase base58).")
    chain: Optional[Chain] = Field(default=None, description="Chain; auto-detected from the address format if omitted.")


class RiskInput(AddressInput):
    lang: Optional[Literal["en", "ja"]] = Field(default=None, description="Language of text fields (default en).")


class HackInput(BaseModel):
    address: str = Field(description="Blockchain address, exactly as received.")
    chain: Optional[HackChain] = Field(
        default=None, description="Narrow to one chain; an EVM address is matched on every EVM chain if omitted."
    )


class BatchInput(BaseModel):
    addresses: list[str] = Field(min_length=1, max_length=50, description="1-50 addresses, exactly as received.")
    chain: Optional[HackChain] = Field(default=None)


def _ok(result: dict[str, Any]) -> str:
    return json.dumps({"result": result, "disclaimer": DISCLAIMER}, ensure_ascii=False)


def _err(exc: Exception) -> str:
    return json.dumps({"error": str(exc)})


def _make_tool(
    client: ChainAnalyzerClient,
    name: str,
    description: str,
    schema: type[BaseModel],
    call: Callable[[ChainAnalyzerClient, dict[str, Any]], Awaitable[dict[str, Any]]],
) -> BaseTool:
    async def _arun(**kwargs: Any) -> str:
        try:
            return _ok(await call(client, kwargs))
        except ChainAnalyzerError as exc:
            return _err(exc)

    def _run(**kwargs: Any) -> str:
        # Sync path: a fresh client on a private event loop (the shared one may be bound to another loop).
        async def _once() -> str:
            c = client.clone()
            try:
                return _ok(await call(c, kwargs))
            except ChainAnalyzerError as exc:
                return _err(exc)
            finally:
                await c.aclose()

        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(_once())
        raise RuntimeError(f"{name}: use ainvoke() inside a running event loop")

    return StructuredTool.from_function(
        func=_run, coroutine=_arun, name=name, description=description, args_schema=schema
    )


def get_chainanalyzer_tools(
    client: Optional[ChainAnalyzerClient] = None, *, include_batch: bool = False, **client_kwargs: Any
) -> list[BaseTool]:
    """Return the ChainAnalyzer tools. ``include_batch`` adds the $5.00 batch tool (off by default)."""
    ca = client or ChainAnalyzerClient(**client_kwargs)
    tools = [
        _make_tool(
            ca,
            "chainanalyzer_sanctions_check",
            "Screen a blockchain address against sanctions lists (OFAC, EU, UK, UN, JFSA) and ScamDB across 12 chains. "
            f"Costs ${PRICES_USD['sanctions']} USDC per call. Call this first; a hit is enough to stop and report.",
            AddressInput,
            lambda c, a: c.sanctions(a["address"], a.get("chain")),
        ),
        _make_tool(
            ca,
            "chainanalyzer_hack_exposure",
            "Is this address connected to a known hack (published incidents only, e.g. the 2026 Binance hack)? "
            "Returns a verdict, hop distance from the attacker, role and lower-bound amounts per incident. "
            f"Costs ${PRICES_USD['hack-exposure']} USDC per call.",
            HackInput,
            lambda c, a: c.hack_exposure(a["address"], a.get("chain")),
        ),
        _make_tool(
            ca,
            "chainanalyzer_freeze_status",
            "Is this address frozen or blacklisted by a stablecoin issuer (USDT, USDC, JPYC and others)? Returns the "
            f"current state per token with timestamps. Costs ${PRICES_USD['freeze-status']} USDC per call.",
            AddressInput,
            lambda c, a: c.freeze_status(a["address"], a.get("chain")),
        ),
        _make_tool(
            ca,
            "chainanalyzer_risk_score",
            "Full AML risk score (0-100, severity, detections from 76+ rules, ML anomaly score) with free "
            f"hack-exposure and freeze-status summaries. Costs ${PRICES_USD['risk-score']} USDC per call.",
            RiskInput,
            lambda c, a: c.risk_score(a["address"], a.get("chain"), a.get("lang")),
        ),
    ]
    if include_batch:
        tools.append(
            _make_tool(
                ca,
                "chainanalyzer_hack_exposure_batch",
                "Known-hack exposure for up to 50 addresses in one call (deposit-list screening). "
                f"Costs ${PRICES_USD['hack-exposure-batch']} USDC per call regardless of the number of addresses.",
                BatchInput,
                lambda c, a: c.hack_exposure_batch(a["addresses"], a.get("chain")),
            )
        )
    return tools


class ChainAnalyzerToolkit(BaseToolkit):
    """Toolkit wrapper: ``ChainAnalyzerToolkit(include_batch=False, max_usd_per_call="1.00").get_tools()``."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    client: Optional[ChainAnalyzerClient] = None
    include_batch: bool = False
    api_key: Optional[str] = None
    private_key: Optional[str] = None
    max_usd_per_call: Optional[str] = None
    dry_run: Optional[bool] = None
    base_url: Optional[str] = None

    def get_tools(self) -> list[BaseTool]:
        client = self.client or ChainAnalyzerClient(
            api_key=self.api_key,
            private_key=self.private_key,
            max_usd_per_call=self.max_usd_per_call,
            dry_run=self.dry_run,
            base_url=self.base_url,
        )
        return get_chainanalyzer_tools(client, include_batch=self.include_batch)
