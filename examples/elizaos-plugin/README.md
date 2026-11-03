# ChainAnalyzer plugin skeleton for ElizaOS (v1)

Minimal ElizaOS `Plugin` with three `Action`s for crypto AML screening across 12 chains,
paid per call with x402 (USDC on Base) or an API key. Typechecked against `@elizaos/core@1.7.2`.

| Action | Route | Price (x402) |
| --- | --- | --- |
| `CHAINANALYZER_SANCTIONS_CHECK` | `GET /x402/api/address/{address}/sanctions` | $0.50 |
| `CHAINANALYZER_HACK_EXPOSURE` | `GET /x402/api/address/{address}/hack-exposure` | $0.50 |
| `CHAINANALYZER_RISK_SCORE` | `GET /x402/api/address/{address}/risk-score` | $1.00 |

Each action pulls the first address (EVM / TRON / Bitcoin / XRP / Solana format) and an optional
chain name from the message text, calls the API, sends the JSON plus a disclaimer through the
callback, and returns an `ActionResult` with `data.result`.

## Quickstart

```bash
npm install
```

```ts
// your agent / project
import { chainAnalyzerPlugin } from "plugin-chainanalyzer"

export const character = {
  name: "Compliance Bot",
  plugins: ["@elizaos/plugin-openai"],
  settings: { secrets: { CHAINANALYZER_API_KEY: process.env.CHAINANALYZER_API_KEY } },
}
export const projectAgent = { character, plugins: [chainAnalyzerPlugin] }
```

Then ask the agent: *"Before we credit this deposit, is 0x7f367cC41522cE07553e823bf3be79A889DEbe1B sanctioned?"*

## Settings

Read through `runtime.getSetting()` (character secrets or environment), declared in
`package.json` `agentConfig.pluginParameters`:

| Setting | Meaning |
| --- | --- |
| `CHAINANALYZER_API_KEY` | `tfk_...` key, `X-API-Key` header, billed to your plan |
| `X402_PRIVATE_KEY` | Pay per call in USDC on Base mainnet via x402 (EIP-3009, facilitator settles) |
| `CHAINANALYZER_MAX_USD_PER_CALL` | Spend cap per call, enforced before signing (default `1.00`) |
| `CHAINANALYZER_DRY_RUN` | `1` = quote the price and stop before signing |

Actions only validate when one of the two auth settings is present and the message contains an address.

## Safety notes

- In x402 mode each action call spends USDC. Chat agents can trigger actions often: use a dedicated
  low-balance wallet, keep the per-call cap, and prefer the API key mode for busy bots.
- Results are automated signals, **not a legal determination**. Hack exposure is a **lower-bound**
  taint over published incidents only; no match is not proof of clean funds.

## Before publishing to the ElizaOS registry (not done)

`elizaos publish` expects the package name to start with `plugin-`, a `github:` `repository` field,
`images/logo.jpg` (400x400) and `images/banner.jpg` (1280x640), a build to `dist/`, and `agentConfig`.
This skeleton has the name and `agentConfig` only.
