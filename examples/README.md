# ChainAnalyzer agent-framework examples

Drop-in tools that let AI agents screen crypto addresses with the ChainAnalyzer AML API,
paid per call over [x402](https://www.x402.org/) (USDC on Base mainnet) or with an API key.
Live route list and prices: <https://chain-analyzer.com/x402/api/discover>.

| Framework | Folder | Tools | Auth modes |
| --- | --- | --- | --- |
| LangChain (Python) | [`langchain-python/`](langchain-python/) | sanctions, hack exposure, risk score | API key / x402 |
| OpenAI Agents SDK (Python) | [`openai-agents-python/`](openai-agents-python/) | sanctions, hack exposure, risk score | API key / x402 |
| Vercel AI SDK (TypeScript) | [`vercel-ai-sdk/`](vercel-ai-sdk/) | sanctions, hack exposure, risk score | API key / x402 |
| ElizaOS v1 (TypeScript) | [`elizaos-plugin/`](elizaos-plugin/) | 3 actions (same routes) | API key / x402 |
| Any MCP client (Claude, Cursor, ...) | [repo root](../) | full tool set | API key / x402 |

| Route | Price |
| --- | --- |
| `GET /x402/api/address/{address}/sanctions` | $0.50 |
| `GET /x402/api/address/{address}/hack-exposure` | $0.50 |
| `GET /x402/api/address/{address}/risk-score` (includes a free `hack_exposure` summary) | $1.00 |

## Auth

- `CHAINANALYZER_API_KEY=tfk_...`: sent as `X-API-Key`, billed to your ChainAnalyzer plan.
- `X402_PRIVATE_KEY=0x...`: the server answers `402 Payment Required`; the official x402 SDK signs an
  EIP-3009 USDC authorization on Base mainnet and retries; the facilitator settles.
- Both set: the API key is used. Secrets come from the environment only.
- `CHAINANALYZER_MAX_USD_PER_CALL` (default `1.00`) caps each payment before signing;
  `CHAINANALYZER_DRY_RUN=1` stops before signing and returns the quoted price.

## Safety

- Pay-per-call costs are real. Use a dedicated low-balance wallet and bound your agent's steps.
- Outputs are automated screening signals, **not a legal determination**. Hack exposure is a
  **lower-bound** taint over published incidents only.
- Keep a human in the loop for crediting, freezing and reporting decisions.
