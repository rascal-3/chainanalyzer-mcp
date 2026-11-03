# @chainanalyzer/ai-sdk

Blockchain AML tools for the [Vercel AI SDK](https://ai-sdk.dev). Let an agent screen a crypto address before it
credits a deposit, sends a payout or onboards a counterparty — across Bitcoin, Ethereum and EVM L2s, Solana, TRON,
XRP and Kaia (12 chains).

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
npm install @chainanalyzer/ai-sdk ai zod
```

## Use

```ts
import { generateText, stepCountIs } from "ai"
import { openai } from "@ai-sdk/openai"
import { chainAnalyzerTools } from "@chainanalyzer/ai-sdk"

const { text } = await generateText({
  model: openai("gpt-5-mini"),
  tools: chainAnalyzerTools(), // reads X402_PRIVATE_KEY or CHAINANALYZER_API_KEY from the environment
  stopWhen: stepCountIs(5),
  prompt:
    "A user wants to deposit from 0x5227f603c1ee34ce3c06efe6477003bdfccb2f8c on Ethereum. " +
    "Screen it (sanctions first, then hack exposure) and say CREDIT, REVIEW or HOLD with reasons.",
})
```

## Auth

| Option | Environment variable | Notes |
| --- | --- | --- |
| `apiKey` | `CHAINANALYZER_API_KEY` | `tfk_…` key from chain-analyzer.com → Account → API Keys. Wins if both are set. |
| `privateKey` | `X402_PRIVATE_KEY` | Hex key of a **dedicated low-balance wallet** holding USDC on Base mainnet. |
| `maxUsdPerCall` | `CHAINANALYZER_MAX_USD_PER_CALL` | Cap per payment, enforced before signing. Default `1.00`. |
| `dryRun` | `CHAINANALYZER_DRY_RUN=1` | Stop before signing and return the quoted price. |
| `includeBatch` | — | Adds the $5.00 batch tool (also set `maxUsdPerCall` ≥ `5.00`). |

`ChainAnalyzerClient` is exported as well if you want to call the API without the AI SDK.

## Notes

- Results are automated screening signals, **not a legal determination**. Hack exposure is a lower-bound taint over
  published incidents only; no match (or no freeze) is not proof that funds are clean. Keep a human in the loop.
- Failed requests are not charged. Live routes and prices: <https://chain-analyzer.com/x402/api/discover>
- MCP server (Claude, Cursor …): [`chainanalyzer-mcp`](https://www.npmjs.com/package/chainanalyzer-mcp).
  More framework examples: [examples/](https://github.com/rascal-3/chainanalyzer-mcp/tree/main/examples).

MIT License
