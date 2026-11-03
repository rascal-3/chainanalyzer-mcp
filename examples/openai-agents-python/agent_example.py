"""Agent example: "screen this deposit address before crediting".

    export OPENAI_API_KEY=...
    export CHAINANALYZER_API_KEY=tfk_...      # or X402_PRIVATE_KEY=0x...
    python agent_example.py 0xSomeDepositAddress ethereum [--dry-run]
"""

from __future__ import annotations

import asyncio
import os
import sys

from agents import Agent, Runner

from chainanalyzer_agents import CHAINANALYZER_TOOLS, close_client

INSTRUCTIONS = """You screen incoming crypto deposits before they are credited.
1. Call chainanalyzer_sanctions_check first ($0.50). sanctioned=true -> HOLD, stop.
2. Call chainanalyzer_hack_exposure ($0.50). matched=true -> REVIEW, cite incident, hop and role.
3. Only for large amounts with both checks clean, call chainanalyzer_risk_score ($1.00):
   severity HIGH/CRITICAL -> REVIEW, otherwise CREDIT.
Never repeat a call for the same address. Answer with decision (CREDIT / REVIEW / HOLD),
a one-line reason, tools used and total USDC cost, and note it is not a legal determination."""


async def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    if "--dry-run" in sys.argv:
        os.environ["CHAINANALYZER_DRY_RUN"] = "1"
    if not args:
        sys.exit("usage: python agent_example.py <address> [chain] [--dry-run]")
    address, chain = args[0], (args[1] if len(args) > 1 else None)

    agent = Agent(
        name="Deposit screener",
        instructions=INSTRUCTIONS,
        tools=CHAINANALYZER_TOOLS,
        model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
    )
    try:
        prompt = f"Deposit of 25,000 USDC from {address}" + (f" on {chain}" if chain else "") + ". Credit it?"
        result = await Runner.run(agent, prompt, max_turns=6)  # bounds the number of paid calls
        print(result.final_output)
    finally:
        await close_client()


if __name__ == "__main__":
    asyncio.run(main())
