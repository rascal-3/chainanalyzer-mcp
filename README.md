# chainanalyzer-mcp

MCP Server for [ChainAnalyzer](https://chain-analyzer.com) — multi-chain blockchain AML risk analysis for AI agents.

Scan any address across **Bitcoin, Ethereum, Polygon, Avalanche, and Solana** for sanctions violations, money laundering patterns, rug pulls, wallet drainers, and more. 76+ detection rules, ML anomaly scoring, and Neo4j graph analysis.

## Tools

| Tool | Description | Price |
|------|-------------|-------|
| `check_address_risk` | AML risk score for any blockchain address | $0.005 |
| `sanctions_check` | OFAC / FATF / JFSA sanctions screening | $0.003 |
| `trace_transaction` | Transaction flow tracing with ML anomaly detection | $0.01 |
| `detect_coinjoin` | CoinJoin / mixing pattern detection (Bitcoin) | $0.01 |
| `cluster_wallet` | Wallet clustering via Neo4j graph analysis | $0.02 |
| `batch_screening` | Batch AML screening (up to 50 addresses) | $0.05 |

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

- **Bitcoin** — OFAC screening, dust attacks, peel chains, CoinJoin detection
- **Ethereum** — 18+ detectors, Neo4j graph analysis, sanctions, mixers
- **Polygon** — Full EVM AML suite, Etherscan V2 compatible
- **Avalanche** — Full EVM AML suite, Routescan API
- **Solana** — Token security (rug pull, honeypot), wallet drainer detection

## Links

- [ChainAnalyzer](https://chain-analyzer.com) — Web platform
- [Documentation](https://chain-analyzer.com/docs/api) — API reference
- [x402 Protocol](https://x402.org) — Pay-per-request standard

## License

MIT - see [LICENSE](LICENSE)

---

Built by [refinancier, inc.](https://chain-analyzer.com)
