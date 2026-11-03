"""LangChain tools for ChainAnalyzer AML screening.

    from chainanalyzer_langchain import get_chainanalyzer_tools
    tools = get_chainanalyzer_tools()          # reads env for auth

Each tool is async (``ainvoke``) and costs USDC per call in x402 mode:
sanctions $0.50, hack exposure $0.50, risk score $1.00.
"""

from __future__ import annotations

import json
from typing import Literal, Optional

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, Field

from chainanalyzer_client import DISCLAIMER, PRICES_USD, ChainAnalyzerClient, ChainAnalyzerError

Chain = Literal[
    "bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum",
    "optimism", "avalanche", "solana", "kaia", "tron", "xrp",
]
HackChain = Literal[
    "bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum",
    "optimism", "avalanche", "solana", "kaia", "tron",
]


class AddressInput(BaseModel):
    address: str = Field(description="Blockchain address to screen (case preserved; do not lowercase base58).")
    chain: Optional[Chain] = Field(default=None, description="Chain; auto-detected from the address format if omitted.")


class RiskInput(AddressInput):
    lang: Optional[Literal["en", "ja"]] = Field(default=None, description="Language of text fields (default en).")


class HackInput(BaseModel):
    address: str = Field(description="Blockchain address to look up.")
    chain: Optional[HackChain] = Field(
        default=None, description="Narrow to one chain. An EVM address is matched on every EVM chain if omitted."
    )


def _wrap(result: dict) -> str:
    return json.dumps({"result": result, "disclaimer": DISCLAIMER}, ensure_ascii=False)


def get_chainanalyzer_tools(client: ChainAnalyzerClient | None = None) -> list[BaseTool]:
    """Return [sanctions, hack_exposure, risk_score] as LangChain tools."""
    ca = client or ChainAnalyzerClient()

    async def sanctions(address: str, chain: Optional[str] = None) -> str:
        try:
            return _wrap(await ca.sanctions(address, chain))
        except ChainAnalyzerError as exc:
            return json.dumps({"error": str(exc)})

    async def hack_exposure(address: str, chain: Optional[str] = None) -> str:
        try:
            return _wrap(await ca.hack_exposure(address, chain))
        except ChainAnalyzerError as exc:
            return json.dumps({"error": str(exc)})

    async def risk_score(address: str, chain: Optional[str] = None, lang: Optional[str] = None) -> str:
        try:
            return _wrap(await ca.risk_score(address, chain, lang))
        except ChainAnalyzerError as exc:
            return json.dumps({"error": str(exc)})

    return [
        StructuredTool.from_function(
            coroutine=sanctions,
            name="chainanalyzer_sanctions_check",
            description=(
                "Screen a blockchain address against OFAC / FATF / JFSA sanctions lists across 12 chains. "
                f"Returns sanctioned true/false and matched lists. Costs ${PRICES_USD['sanctions']} USDC per call. "
                "Call this first for any deposit or withdrawal counterparty."
            ),
            args_schema=AddressInput,
        ),
        StructuredTool.from_function(
            coroutine=hack_exposure,
            name="chainanalyzer_hack_exposure",
            description=(
                "Is this address connected to a known hack (published incidents only)? Returns verdict, hop distance "
                "from the attacker, role and lower-bound amounts per incident. "
                f"Costs ${PRICES_USD['hack-exposure']} USDC per call. Not a legal determination."
            ),
            args_schema=HackInput,
        ),
        StructuredTool.from_function(
            coroutine=risk_score,
            name="chainanalyzer_risk_score",
            description=(
                "Full AML risk score (0-100, severity, detections from 76+ rules, ML anomaly score) for an address, "
                "including a free hack_exposure summary. "
                f"Costs ${PRICES_USD['risk-score']} USDC per call; use when sanctions is clean but you need a decision."
            ),
            args_schema=RiskInput,
        ),
    ]
