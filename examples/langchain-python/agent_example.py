"""Agent example: "screen this deposit address before crediting".

    export OPENAI_API_KEY=...                 # or any LangChain chat model provider
    export CHAINANALYZER_API_KEY=tfk_...      # or X402_PRIVATE_KEY=0x...
    python agent_example.py 0xSomeDepositAddress ethereum

Add --dry-run to stop before any x402 payment is signed (prints the quoted price).
"""

from __future__ import annotations

import asyncio
import os
import sys

from langchain.agents import create_agent

from chainanalyzer_client import ChainAnalyzerClient
from chainanalyzer_langchain import get_chainanalyzer_tools

POLICY = """You are a crypto exchange deposit-screening assistant.
Before a deposit is credited, screen the sending address:
1. Always call chainanalyzer_sanctions_check first ($0.50).
   If sanctioned=true -> answer HOLD (do not credit) and stop.
2. Then call chainanalyzer_hack_exposure ($0.50).
   If matched=true -> answer REVIEW and cite incident name, hop and role.
3. Only if both are clean and the amount is large, call chainanalyzer_risk_score ($1.00).
   severity HIGH/CRITICAL -> REVIEW; otherwise CREDIT.
Never call the same tool twice for the same address. Keep the final answer to:
decision (CREDIT / REVIEW / HOLD), one-line reason, tools used and total cost in USDC.
State that this is an automated signal, not a legal determination."""


async def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    if "--dry-run" in sys.argv:
        os.environ["CHAINANALYZER_DRY_RUN"] = "1"
    if not args:
        sys.exit("usage: python agent_example.py <address> [chain] [--dry-run]")
    address, chain = args[0], (args[1] if len(args) > 1 else None)

    client = ChainAnalyzerClient()
    agent = create_agent(
        model=os.getenv("LLM_MODEL", "openai:gpt-4o-mini"),
        tools=get_chainanalyzer_tools(client),
        system_prompt=POLICY,
    )
    try:
        question = f"Deposit of 25,000 USDC incoming from {address}" + (f" on {chain}" if chain else "") + ". Credit it?"
        result = await agent.ainvoke({"messages": [{"role": "user", "content": question}]})
        print(result["messages"][-1].content)
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
