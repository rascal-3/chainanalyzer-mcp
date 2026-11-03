# ChainAnalyzer tools for the OpenAI Agents SDK (Python)

Three `@function_tool`s (strict JSON schema) for crypto AML screening across 12 chains:

| Tool | Route | Price (x402) |
| --- | --- | --- |
| `chainanalyzer_sanctions_check` | `GET /x402/api/address/{address}/sanctions` | $0.50 |
| `chainanalyzer_hack_exposure` | `GET /x402/api/address/{address}/hack-exposure` | $0.50 |
| `chainanalyzer_risk_score` | `GET /x402/api/address/{address}/risk-score` (includes a free `hack_exposure` summary) | $1.00 |

## Quickstart

```bash
pip install -r requirements.txt
export OPENAI_API_KEY=...
export CHAINANALYZER_API_KEY=tfk_...        # or: export X402_PRIVATE_KEY=0x...
python agent_example.py 0xSenderAddress ethereum --dry-run   # quotes prices, pays nothing
python agent_example.py 0xSenderAddress ethereum
```

```python
from agents import Agent, Runner
from chainanalyzer_agents import CHAINANALYZER_TOOLS

agent = Agent(name="screener", instructions="Screen addresses before crediting.", tools=CHAINANALYZER_TOOLS)
print((await Runner.run(agent, "Is 0x7f367cC41522cE07553e823bf3be79A889DEbe1B sanctioned?", max_turns=4)).final_output)
```

## Auth modes

Same as the LangChain example (shared `chainanalyzer_client.py`):

- `CHAINANALYZER_API_KEY=tfk_...`: `X-API-Key` header, billed to your plan.
- `X402_PRIVATE_KEY=0x...`: pay per call in USDC on Base mainnet via x402 (EIP-3009, facilitator settles).
- `CHAINANALYZER_MAX_USD_PER_CALL` (default `1.00`) and `CHAINANALYZER_DRY_RUN=1` as safety rails.

Tip: `function_tool` also accepts `needs_approval=True` if you want a human to approve each paid call.

## Safety notes

- Every call in x402 mode spends USDC. Use a low-balance dedicated wallet; `max_turns` bounds the loop.
- Results are automated screening signals, **not a legal determination**. Hack exposure is a
  **lower-bound** taint over published incidents only; no match is not proof of clean funds.
- Keep a human in the loop for crediting, freezing and reporting decisions.
