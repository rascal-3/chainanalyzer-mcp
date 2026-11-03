# ChainAnalyzer tools for the Vercel AI SDK (TypeScript)

Three `tool()`s with zod input schemas for crypto AML screening across 12 chains,
paid per call with [x402](https://www.x402.org/) (`@x402/fetch`) or with an API key.

| Tool | Route | Price (x402) |
| --- | --- | --- |
| `chainanalyzer_sanctions_check` | `GET /x402/api/address/{address}/sanctions` | $0.50 |
| `chainanalyzer_hack_exposure` | `GET /x402/api/address/{address}/hack-exposure` | $0.50 |
| `chainanalyzer_risk_score` | `GET /x402/api/address/{address}/risk-score` (includes a free `hack_exposure` summary) | $1.00 |

Tested against `ai@7.0.162`, `zod@4.6.7`, `@x402/fetch@2.26.0`, `@x402/evm@2.26.0`, `viem@2.56.8`.

## Quickstart

```bash
npm install
export OPENAI_API_KEY=...
export CHAINANALYZER_API_KEY=tfk_...           # or: export X402_PRIVATE_KEY=0x...
CHAINANALYZER_DRY_RUN=1 npm run example -- 0xSenderAddress ethereum   # quotes prices only
npm run example -- 0xSenderAddress ethereum
```

```ts
import { generateText, stepCountIs } from "ai"
import { openai } from "@ai-sdk/openai"
import { chainAnalyzerTools } from "./src/tools.js"

const { text } = await generateText({
  model: openai("gpt-4o-mini"),
  tools: chainAnalyzerTools(),
  stopWhen: stepCountIs(5),
  prompt: "Is 0x7f367cC41522cE07553e823bf3be79A889DEbe1B sanctioned?",
})
```

[`src/example.ts`](src/example.ts) is the "screen this deposit address before crediting" agent:
sanctions first, then hack exposure, and the $1.00 risk score only when needed.

## Auth modes

| Env var | Mode | Billing |
| --- | --- | --- |
| `CHAINANALYZER_API_KEY=tfk_...` | `X-API-Key` header | Your ChainAnalyzer plan |
| `X402_PRIVATE_KEY=0x...` | `wrapFetchWithPayment` + `ExactEvmScheme` on `eip155:8453` (Base mainnet) | Per call, USDC (EIP-3009, facilitator settles) |

Optional: `CHAINANALYZER_MAX_USD_PER_CALL` (default `1.00`, x402 spend controls),
`CHAINANALYZER_DRY_RUN=1` (abort before signing), `CHAINANALYZER_BASE_URL`.

## Safety notes

- In x402 mode every tool call spends USDC. Use a dedicated low-balance wallet and keep `stopWhen` tight.
- Tools run server-side only: never ship `X402_PRIVATE_KEY` or the API key to the browser.
- Results are automated signals, **not a legal determination**. Hack exposure is a **lower-bound**
  taint over published incidents only; no match is not proof of clean funds.
