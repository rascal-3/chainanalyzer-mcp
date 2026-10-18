# chainanalyzer-mcp

MCP Server for [ChainAnalyzer](https://chain-analyzer.com) — multi-chain blockchain AML risk analysis for AI agents.

Scan any address across **12 chains, all live for self-serve** — Bitcoin, Ethereum, Polygon, BNB Smart Chain, Base, Arbitrum, Optimism, Avalanche, Solana, Kaia, TRON, and XRP. 76+ detection rules, ML anomaly scoring, and Neo4j graph analysis.

## Tools

| Tool | Description | Price |
|------|-------------|-------|
| `check_address_risk` | AML risk score for any blockchain address | $1.00 |
| `sanctions_check` | OFAC / FATF / JFSA sanctions screening | $0.50 |
| `trace_transaction` | Transaction flow tracing with ML anomaly detection | $3.00 |
| `detect_coinjoin` | CoinJoin / mixing pattern detection (Bitcoin) | $1.00 |
| `cluster_wallet` | Wallet clustering via Neo4j graph analysis | $2.50 |
| `batch_screening` | Batch AML screening (up to 50 addresses) | $5.00 |
| `bridge_flow_trace` | Multi-hop cross-chain forensic trace with Solver detection + same-intent correlation (NEAR Intents / Wormhole / Stargate / Across / Synapse / Hop / deBridge) | $3.00 |

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

### 1. API Key (Subscription)

Get a `tfk_` API key from [chain-analyzer.com](https://chain-analyzer.com) (Pro plan).

```json
{
  "env": {
    "CHAINANALYZER_API_KEY": "tfk_your_api_key"
  }
}
```

### 2. x402 USDC Payment (Pay-Per-Request)

No account needed. Pay with USDC on Base or Solana per request.

```json
{
  "env": {
    "X402_PRIVATE_KEY": "your_wallet_private_key",
    "X402_NETWORK": "base"
  }
}
```

Requires the `x402` npm package: `npm install x402`

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
| `CHAINANALYZER_API_KEY` | `tfk_` API key (subscription auth) | One of API key or x402 |
| `X402_PRIVATE_KEY` | Wallet private key for USDC payments | One of API key or x402 |
| `X402_NETWORK` | Payment network: `base` or `solana` (default: `base`) | No |
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

`bridge_flow_trace` supports EVM chains, Solana and Kaia. `detect_coinjoin` is Bitcoin only.

## Links

- [ChainAnalyzer](https://chain-analyzer.com) — Web platform
- [Documentation](https://chain-analyzer.com/docs/api) — API reference
- [x402 Protocol](https://x402.org) — Pay-per-request standard

## License

MIT - see [LICENSE](LICENSE)

---

Built by [refinancier, inc.](https://chain-analyzer.com)
