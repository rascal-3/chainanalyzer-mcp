# chainanalyzer-mcp

MCP Server for [ChainAnalyzer](https://chain-analyzer.com) — multi-chain blockchain AML risk analysis for AI agents.

Scan any address across **12 chains, all live for self-serve** — Bitcoin, Ethereum, Polygon, BNB Smart Chain, Base, Arbitrum, Optimism, Avalanche, Solana, Kaia, TRON, and XRP. 76+ detection rules, ML anomaly scoring, and Neo4j graph analysis.

## Tools

| Tool | Description | Price |
|------|-------------|-------|
| `check_address_risk` | AML risk score for any blockchain address (12 chains) | $0.10 |
| `sanctions_check` | OFAC / FATF / JFSA sanctions screening (12 chains) | $0.05 |
| `hack_exposure_lookup` | Is this address connected to a known hack (e.g. Binance 2026)? Verdict, hop distance from the attacker, role and lower-bound amounts per incident (EVM, TRON, Solana, Bitcoin) | $0.05 |
| `freeze_status` | Is this address frozen / blacklisted by a stablecoin issuer (USDT, USDC, JPYC ...)? Current state per token with timestamps (Ethereum, Polygon, Avalanche, TRON) | $0.02 |
| `hack_exposure_batch` | Known-hack exposure for up to 50 addresses in one call (deposit-list screening) | $1.00 |
| `trace_transaction` | Transaction flow tracing with ML anomaly detection (12 chains) | $0.30 |
| `detect_coinjoin` | Takes a Bitcoin transaction id and decides from its structure whether it is a CoinJoin: `is_coinjoin`, `mixer_type`, input / output counts and the groups of equal-value outputs | $0.10 |
| `cluster_wallet` | Wallet clustering via Neo4j graph analysis | $0.25 |
| `batch_screening` | Batch AML screening (up to 50 addresses, 12 chains) | $2.50 |
| `bridge_flow_trace` | Multi-hop cross-chain forensic trace with Solver detection + same-intent correlation (NEAR Intents / Wormhole / Stargate / Across / Synapse / Hop / deBridge). Source chain: EVM chains or Solana | $0.50 |

Prices are per call in x402 mode (USDC, from 2026-11-16). The live list is at <https://chain-analyzer.com/x402/api/discover>. The batch tools are a fixed price per call for up to 50 addresses.

## Agent framework examples

Ready-to-use tools for LangChain, OpenAI Agents SDK, Vercel AI SDK and ElizaOS (pay per call over x402 or with an API key): [`examples/`](examples/).

## Quick Start

### Claude Desktop / Claude Code

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "chainanalyzer-aml": {
      "command": "npx",
      "args": ["-y", "chainanalyzer-mcp"],
      "env": {
        "CHAINANALYZER_API_KEY": "tfk_your_api_key"
      }
    }
  }
}
```

### From Source

```bash
git clone https://github.com/rascal-3/chainanalyzer-mcp.git
cd chainanalyzer-mcp
npm install
npm start
```

## Agent Skill & Claude Code Plugin

The repo ships an [Agent Skill](skills/chainanalyzer-aml/SKILL.md) that tells the agent *when* to use these tools, how to pick the chain from the address format, which tool to call first, and how to report results. It works with any agent that reads `SKILL.md` (Claude Code, Cursor, Codex CLI, Gemini CLI, OpenClaw, ...).

### Claude Code (plugin: MCP server + skill in one step)

```
/plugin marketplace add rascal-3/chainanalyzer-mcp
/plugin install chainanalyzer-aml@chainanalyzer
```

Set `CHAINANALYZER_API_KEY` in your shell environment (or `X402_PRIVATE_KEY` for pay-per-request). The plugin's `.mcp.json` reads it from there.

### Any other agent

Copy `skills/chainanalyzer-aml/` into your agent's skills directory and configure the MCP server as shown in Quick Start.

### MCP Registry

Listed in the official [MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.rascal-3/chainanalyzer-mcp`.

## Authentication

Choose one of three modes:

### 1. API Key (all plans, including Free)

Create a `tfk_` API key at [chain-analyzer.com](https://chain-analyzer.com/login?utm_source=github) → Account → Settings → API Keys. Every plan can issue keys; the Free plan includes 10 scans/month, enough to try sanctions, risk, trace, CoinJoin and cluster before paying. `batch_screening` needs Starter or above and `bridge_flow_trace` needs Business or above in API-key mode (x402 mode has no plan gates). Rate limits by plan: Free 10/min, Starter 30/min, Pro 60/min, Business 120/min, Enterprise 300/min.

```json
{
  "env": {
    "CHAINANALYZER_API_KEY": "tfk_your_api_key"
  }
}
```

### 2. x402 USDC Payment (Pay-Per-Request)

No account needed. Set `X402_PRIVATE_KEY` and the server pays each call automatically in USDC on Base (x402 v2, exact scheme). No extra install is needed. (The ChainAnalyzer x402 API also accepts USDC on Solana when its 402 response offers it, but this server pays on Base only.)

```json
{
  "env": {
    "X402_PRIVATE_KEY": "0x_private_key_of_a_dedicated_low_balance_wallet",
    "X402_MAX_USD_PER_CALL": "1.00"
  }
}
```

- `X402_MAX_USD_PER_CALL` (default `1.00`) caps a single payment. A call priced above it is refused before anything is signed. `batch_screening` costs $2.50, so set it to `2.50` or more to use that tool.
- Calls that fail are not charged: the server settles the payment only after a successful response. If a payment is rejected, the error shows the server's reason and hint.
- Use a dedicated wallet that holds only a small USDC balance on Base. The key is never logged.

> **Use a key whose address has no EIP-7702 delegation.** If the paying address has an EIP-7702 delegation (it has been turned into a smart account), the USDC signature check on Base can fail and the payment is rejected. Pay from a plain address with no delegation.

### 3. Dev Mode

No authentication. Works when the ChainAnalyzer server has `X402_ENABLED=false`.

```json
{
  "env": {
    "CHAINANALYZER_BASE_URL": "http://localhost:3000"
  }
}
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CHAINANALYZER_API_KEY` | `tfk_` API key (any plan, Free included) | One of API key or x402 |
| `X402_PRIVATE_KEY` | Hex EVM private key of the wallet that pays in USDC on Base | One of API key or x402 |
| `X402_MAX_USD_PER_CALL` | Per-call payment limit in USD (default: `1.00`; `2.50` or more for `batch_screening`) | No |
| `X402_NETWORK` | Payment network (default: `base`). Only `base` is supported; any other value is an error | No |
| `CHAINANALYZER_BASE_URL` | API base URL (default: `https://chain-analyzer.com`) | No |

## Example Usage

Once configured, ask your AI agent:

> "Check if this Ethereum address is sanctioned: 0x1234..."

> "Analyze the risk score for this Solana wallet: ABC123..."

> "Trace the fund flow of this Bitcoin transaction and check for mixing patterns"

> "Screen these 20 addresses for AML compliance"

The agent will automatically call the appropriate ChainAnalyzer tools.

## Supported Chains

All 12 chains are live for self-serve plans.

| Chain | Highlights |
|-------|------------|
| Bitcoin | OFAC screening, dust attacks, peel chains, CoinJoin detection |
| Ethereum | 18+ detectors, Neo4j graph analysis, sanctions, mixers |
| Polygon / BNB Smart Chain / Base / Arbitrum / Optimism / Avalanche / Kaia | Full EVM AML suite, bridge tracing |
| Solana | Token security (rug pull, honeypot), wallet drainer detection, bridge tracing |
| TRON | USDT flow screening, sanctions (independent scanner) |
| XRP | Exchange / issuer labels, sanctions (independent scanner) |

`bridge_flow_trace` starts from EVM chains (Kaia included) or Solana. `detect_coinjoin` is Bitcoin only. `freeze_status` covers Ethereum, Polygon, Avalanche and TRON; `hack_exposure_lookup` / `hack_exposure_batch` cover EVM chains, TRON, Solana and Bitcoin.

## Links

- [ChainAnalyzer](https://chain-analyzer.com) — Web platform
- [Using ChainAnalyzer from AI agents](https://chain-analyzer.com/docs/ai-agents) — skill, plugin and MCP setup guide
- [API reference](https://chain-analyzer.com/docs/api)
- [x402 Protocol](https://x402.org) — Pay-per-request standard

## License

MIT - see [LICENSE](LICENSE)

---

Built by [refinancier, inc.](https://chain-analyzer.com)
