# langchain-chainanalyzer

LangChain tools for [ChainAnalyzer](https://chain-analyzer.com) blockchain AML screening. Let an agent screen a crypto
address before it credits a deposit, sends a payout or onboards a counterparty — across Bitcoin, Ethereum and EVM L2s,
Solana, TRON, XRP and Kaia (12 chains).

| Tool | What it answers | Price (x402) |
| --- | --- | --- |
| `chainanalyzer_sanctions_check` | Is the address on a sanctions list (OFAC, EU, UK, UN, JFSA) or in ScamDB? | $0.50 |
| `chainanalyzer_hack_exposure` | Is it connected to a known hack (e.g. the 2026 Binance hack)? Hops from the attacker, role, lower-bound amounts | $0.50 |
| `chainanalyzer_freeze_status` | Has a stablecoin issuer (USDT, USDC, JPYC …) frozen it? | $0.10 |
| `chainanalyzer_risk_score` | Full AML risk score (76+ detection rules + ML), with free hack-exposure and freeze summaries | $1.00 |
| `chainanalyzer_hack_exposure_batch` (opt-in) | Known-hack exposure for up to 50 addresses | $5.00 |

Pay per call in USDC on Base via [x402](https://www.x402.org/) — no account, no signup — or use a ChainAnalyzer API key.

## Install

```bash
pip install langchain-chainanalyzer            # API-key mode
pip install "langchain-chainanalyzer[x402]"    # + pay per call in USDC (x402)
```

## Use

```python
from langchain.agents import create_agent
from langchain_chainanalyzer import ChainAnalyzerToolkit

tools = ChainAnalyzerToolkit(max_usd_per_call="1.00").get_tools()
agent = create_agent("openai:gpt-5-mini", tools=tools)

result = await agent.ainvoke({"messages": [{
    "role": "user",
    "content": "A user wants to deposit from 0x5227f603c1ee34ce3c06efe6477003bdfccb2f8c (Ethereum). "
               "Screen it (sanctions first, then hack exposure) and answer CREDIT, REVIEW or HOLD with reasons.",
}]})
```

Each tool also works on its own: `await tools[1].ainvoke({"address": "0x5227f603c1ee34ce3c06efe6477003bdfccb2f8c"})`.

## Auth and safety

| Argument | Environment variable | Notes |
| --- | --- | --- |
| `api_key` | `CHAINANALYZER_API_KEY` | `tfk_…` key from chain-analyzer.com → Account → API Keys. Wins if both are set. |
| `private_key` | `X402_PRIVATE_KEY` | Hex key of a **dedicated low-balance wallet** with USDC on Base mainnet (needs the `x402` extra). |
| `max_usd_per_call` | `CHAINANALYZER_MAX_USD_PER_CALL` | Cap per payment, enforced before signing. Default `1.00`. |
| `dry_run` | `CHAINANALYZER_DRY_RUN=1` | Stop before signing and return the quoted price. |
| `include_batch` | — | Adds the $5.00 batch tool (also raise `max_usd_per_call` to `5.00`). |

- Results are automated screening signals, **not a legal determination**. Hack exposure is a lower-bound taint over
  published incidents only; no match (or no freeze) is not proof that funds are clean. Keep a human in the loop.
- Failed requests are not charged. Live routes and prices: <https://chain-analyzer.com/x402/api/discover>
- Also available: MCP server [`chainanalyzer-mcp`](https://www.npmjs.com/package/chainanalyzer-mcp) and Vercel AI SDK
  tools [`@chainanalyzer/ai-sdk`](https://www.npmjs.com/package/@chainanalyzer/ai-sdk).

MIT License
