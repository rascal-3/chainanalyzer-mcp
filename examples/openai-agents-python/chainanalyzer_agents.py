"""OpenAI Agents SDK function tools for ChainAnalyzer AML screening.

    from chainanalyzer_agents import CHAINANALYZER_TOOLS
    agent = Agent(name="screener", tools=CHAINANALYZER_TOOLS, ...)

x402 prices: sanctions $0.50, hack exposure $0.50, risk score $1.00.
"""

from __future__ import annotations

import json
from typing import Literal, Optional

from agents import function_tool

from chainanalyzer_client import DISCLAIMER, ChainAnalyzerClient, ChainAnalyzerError

Chain = Literal[
    "bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum",
    "optimism", "avalanche", "solana", "kaia", "tron", "xrp",
]
HackChain = Literal[
    "bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum",
    "optimism", "avalanche", "solana", "kaia", "tron",
]

_client: ChainAnalyzerClient | None = None


def _ca() -> ChainAnalyzerClient:
    global _client
    if _client is None:
        _client = ChainAnalyzerClient()  # reads auth from env
    return _client


async def close_client() -> None:
    if _client is not None:
        await _client.aclose()


def _wrap(result: dict) -> str:
    return json.dumps({"result": result, "disclaimer": DISCLAIMER}, ensure_ascii=False)


@function_tool
async def chainanalyzer_sanctions_check(address: str, chain: Optional[Chain] = None) -> str:
    """Screen a blockchain address against OFAC / FATF / JFSA sanctions lists. Costs $0.50 USDC per call.

    Args:
        address: Address to screen, exactly as received (do not lowercase base58).
        chain: Chain; auto-detected from the address format if omitted.
    """
    try:
        return _wrap(await _ca().sanctions(address, chain))
    except ChainAnalyzerError as exc:
        return json.dumps({"error": str(exc)})


@function_tool
async def chainanalyzer_hack_exposure(address: str, chain: Optional[HackChain] = None) -> str:
    """Is this address connected to a known hack (published incidents only)? Costs $0.50 USDC per call.

    Returns verdict, hop distance from the attacker, role and lower-bound amounts per incident.
    Not a legal determination.

    Args:
        address: Address to look up.
        chain: Narrow to one chain; an EVM address is matched on every EVM chain if omitted.
    """
    try:
        return _wrap(await _ca().hack_exposure(address, chain))
    except ChainAnalyzerError as exc:
        return json.dumps({"error": str(exc)})


@function_tool
async def chainanalyzer_risk_score(
    address: str, chain: Optional[Chain] = None, lang: Optional[Literal["en", "ja"]] = None
) -> str:
    """Full AML risk score (0-100, severity, detections, ML anomaly score, free hack_exposure summary). Costs $1.00 USDC.

    Args:
        address: Address to score.
        chain: Chain; auto-detected if omitted.
        lang: Language of text fields (default en).
    """
    try:
        return _wrap(await _ca().risk_score(address, chain, lang))
    except ChainAnalyzerError as exc:
        return json.dumps({"error": str(exc)})


CHAINANALYZER_TOOLS = [chainanalyzer_sanctions_check, chainanalyzer_hack_exposure, chainanalyzer_risk_score]
