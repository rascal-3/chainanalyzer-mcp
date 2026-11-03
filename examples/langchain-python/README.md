# ChainAnalyzer tools for LangChain (Python)

Three async LangChain tools for crypto AML screening across 12 chains
(Bitcoin, Ethereum, Polygon, BNB Smart Chain, Base, Arbitrum, Optimism, Avalanche,
Solana, Kaia, TRON, XRP):

| Tool | Route | Price (x402) |
| --- | --- | --- |
| `chainanalyzer_sanctions_check` | `GET /x402/api/address/{address}/sanctions` | $0.50 |
| `chainanalyzer_hack_exposure` | `GET /x402/api/address/{address}/hack-exposure` | $0.50 |
| `chainanalyzer_risk_score` | `GET /x402/api/address/{address}/risk-score` (includes a free `hack_exposure` summary) | $1.00 |

Full route list and prices: <https://chain-analyzer.com/x402/api/discover>.

## Quickstart

```bash
pip install -r requirements.txt
export CHAINANALYZER_API_KEY=tfk_...        # subscription key, or:
# export X402_PRIVATE_KEY=0x...            # pay per call in USDC on Base
```

```python
import asyncio
from chainanalyzer_langchain import get_chainanalyzer_tools

sanctions, hack, risk = get_chainanalyzer_tools()
print(asyncio.run(sanctions.ainvoke({"address": "0x7f367cC41522cE07553e823bf3be79A889DEbe1B"})))
```

## Agent example: screen a deposit before crediting

```bash
export OPENAI_API_KEY=...                   # any LangChain chat model works (LLM_MODEL=provider:model)
python agent_example.py 0xSenderAddress ethereum --dry-run   # no payment, prints quoted prices
python agent_example.py 0xSenderAddress ethereum             # real calls
```

The system prompt in [`agent_example.py`](agent_example.py) runs sanctions first,
then hack exposure, and only escalates to the $1.00 risk score when needed, and
ends with `CREDIT / REVIEW / HOLD` plus the total cost.

## Auth modes

| Env var | Mode | Billing |
| --- | --- | --- |
| `CHAINANALYZER_API_KEY=tfk_...` | `X-API-Key` header | Your ChainAnalyzer plan (no on-chain payment) |
| `X402_PRIVATE_KEY=0x...` | x402: HTTP 402 -> EIP-3009 USDC authorization on Base mainnet -> facilitator settles | Per call, USDC |

If both are set, the API key is used. Secrets are read from the environment only.

Optional:

- `CHAINANALYZER_MAX_USD_PER_CALL` (default `1.00`): enforced by the x402 SDK spend controls before signing.
- `CHAINANALYZER_DRY_RUN=1`: stop right before signing and return the quoted price.
- `CHAINANALYZER_BASE_URL`: defaults to `https://chain-analyzer.com`.

## Safety notes

- **Costs are real.** In x402 mode every tool call moves USDC. Use a dedicated hot wallet holding a
  small float, keep the per-call cap, and consider a step budget on your agent.
- **Not a legal determination.** Results are automated screening signals. Hack exposure is a
  *lower-bound* taint over *published incidents only*; "no match" does not prove funds are clean.
- Keep a human in the loop before crediting, freezing, or filing a report.
- Do not lowercase base58 addresses (Bitcoin, TRON, Solana); pass them as received.
