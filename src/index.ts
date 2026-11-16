#!/usr/bin/env node
/**
 * ChainAnalyzer MCP Server
 *
 * Provides blockchain AML analysis tools to AI agents via the
 * Model Context Protocol. Supports Claude Desktop, Claude Code,
 * ChatGPT, Gemini, and any MCP-compatible client.
 *
 * Authentication modes:
 *   1. x402 (USDC): Set X402_PRIVATE_KEY — pay per request
 *   2. API key:     Set CHAINANALYZER_API_KEY — subscription-based
 *   3. Dev mode:    Neither set — works when server has X402_ENABLED=false
 *
 * Usage:
 *   npx @chainanalyzer/mcp-server
 *   # or
 *   tsx packages/mcp/src/index.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { tools, buildUrl } from "./tools.js"
import { x402Request } from "./x402-client.js"

const BASE_URL =
  process.env.CHAINANALYZER_BASE_URL || "https://chain-analyzer.com"

const server = new McpServer({
  name: "chainanalyzer-aml",
  version: "1.7.1",
})

// x402 prices below are the list prices from 2026-11-16
// (live list: https://chain-analyzer.com/x402/api/discover).

// ── Tool: check_address_risk ($0.10) ─────────────────────────────

server.tool(
  "check_address_risk",
  "Get AML risk score for any blockchain address. Returns risk level, score (0-100), detections, and ML anomaly score. 12 chains live for self-serve (BTC, ETH, POL, BNB, BASE, ARB, OP, AVAX, SOL, KAIA, TRX, XRP). Price: $0.10 per request.",
  {
    address: z.string().describe("Blockchain address to analyze"),
    chain: z
      .enum(["bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum", "optimism", "avalanche", "solana", "kaia", "tron", "xrp"])
      .optional()
      .describe("Chain (auto-detected if omitted)"),
    lang: z.enum(["en", "ja"]).optional().describe("Language (default: en)"),
  },
  async ({ address, chain, lang }) => {
    const tool = tools.find((t) => t.name === "check_address_risk")!
    const url = buildUrl(BASE_URL, tool, { address, chain, lang })
    const data = await x402Request(url)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── Tool: sanctions_check ($0.05) ────────────────────────────────

server.tool(
  "sanctions_check",
  "Screen address against OFAC, FATF, JFSA, and ChainAnalyzer ScamDB sanctions lists. 12 chains. Price: $0.05 per request.",
  {
    address: z.string().describe("Blockchain address to screen"),
    chain: z
      .enum(["bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum", "optimism", "avalanche", "solana", "kaia", "tron", "xrp"])
      .optional()
      .describe("Chain (auto-detected if omitted)"),
  },
  async ({ address, chain }) => {
    const tool = tools.find((t) => t.name === "sanctions_check")!
    const url = buildUrl(BASE_URL, tool, { address, chain })
    const data = await x402Request(url)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── Tool: hack_exposure_lookup ($0.05) ───────────────────────────

server.tool(
  "hack_exposure_lookup",
  "Is this address connected to a known hack, and how? Stolen-funds taint ledger lookup (published incidents only): verdict, hop distance from the attacker, role and lower-bound amounts per incident. EVM chains, TRON, Solana and Bitcoin. Not a legal determination. Price: $0.05 per request.",
  {
    address: z.string().describe("Blockchain address to look up"),
    chain: z
      .enum([
        "bitcoin",
        "ethereum",
        "polygon",
        "bsc",
        "base",
        "arbitrum",
        "optimism",
        "avalanche",
        "kaia",
        "solana",
        "tron",
      ])
      .optional()
      .describe("Narrow to one chain (EVM addresses match every EVM chain if omitted)"),
  },
  async ({ address, chain }) => {
    const tool = tools.find((t) => t.name === "hack_exposure_lookup")!
    const url = buildUrl(BASE_URL, tool, { address, chain })
    const data = await x402Request(url)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── Tool: freeze_status ($0.02) ───────────────────────────────────

server.tool(
  "freeze_status",
  "Is this address currently frozen / blacklisted by a stablecoin issuer? Current state per token (latest event wins), first freeze time, last event tx, and coverage (tokens indexed on the searched chains: Ethereum, Polygon, Avalanche, TRON). Absence of a freeze is not a guarantee. Price: $0.02 per request.",
  {
    address: z.string().describe("Blockchain address to look up"),
    chain: z
      .enum(["ethereum", "polygon", "avalanche", "tron"])
      .optional()
      .describe("Narrow to one chain (EVM addresses are checked on every indexed EVM chain if omitted)"),
  },
  async ({ address, chain }) => {
    const tool = tools.find((t) => t.name === "freeze_status")!
    const url = buildUrl(BASE_URL, tool, { address, chain })
    const data = await x402Request(url)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── Tool: hack_exposure_batch ($1.00 fixed) ───────────────────────

server.tool(
  "hack_exposure_batch",
  "Batch known-hack exposure for up to 50 addresses (published incidents only): verdict and up to 3 incidents (slug, hop, role) per address; invalid addresses listed separately. EVM chains, TRON, Solana and Bitcoin. Price: $1.00 per batch (fixed, up to 50 addresses).",
  {
    addresses: z
      .array(z.string())
      .min(1)
      .max(50)
      .describe("Addresses to look up"),
    chain: z.string().optional().describe("Chain hint applied to every address"),
  },
  async ({ addresses, chain }) => {
    const tool = tools.find((t) => t.name === "hack_exposure_batch")!
    const url = `${BASE_URL}${tool.endpoint}`
    const data = await x402Request(url, {
      method: "POST",
      body: JSON.stringify({ addresses, chain }),
    })
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── Tool: trace_transaction ($0.30) ──────────────────────────────

server.tool(
  "trace_transaction",
  "Trace fund flows for a transaction with ML anomaly detection. Returns graph of addresses and transfers. 12 chains; pass chain for TRON and XRP transaction ids. Price: $0.30 per request.",
  {
    tx_hash: z.string().describe("Transaction hash to trace"),
    chain: z
      .enum(["bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum", "optimism", "avalanche", "solana", "kaia", "tron", "xrp"])
      .optional()
      .describe("Chain (auto-detected for EVM, Solana and Bitcoin hashes if omitted)"),
    depth: z
      .number()
      .min(1)
      .max(3)
      .optional()
      .describe("Trace depth, 1-3 (default: 3)"),
  },
  async ({ tx_hash, chain, depth }) => {
    const tool = tools.find((t) => t.name === "trace_transaction")!
    const url = buildUrl(BASE_URL, tool, { tx_hash, chain, depth })
    const data = await x402Request(url)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── Tool: detect_coinjoin ($0.10) ─────────────────────────────────

server.tool(
  "detect_coinjoin",
  "Takes a Bitcoin transaction id and decides from the transaction's structure whether it is a CoinJoin. Returns is_coinjoin, mixer_type (Wasabi/WabiSabi, Whirlpool, JoinMarket or generic equal-output), the input and output counts, and the groups of equal-value outputs. Bitcoin only. Price: $0.10 per request.",
  {
    tx_hash: z.string().describe("Bitcoin transaction id (txid)"),
  },
  async ({ tx_hash }) => {
    const tool = tools.find((t) => t.name === "detect_coinjoin")!
    const url = buildUrl(BASE_URL, tool, { tx_hash })
    const data = await x402Request(url)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── Tool: cluster_wallet ($0.25) ──────────────────────────────────

server.tool(
  "cluster_wallet",
  "Identify related addresses through Neo4j graph clustering. Returns cluster size and related addresses. Price: $0.25 per request.",
  {
    address: z.string().describe("Starting address for cluster analysis"),
    depth: z
      .number()
      .min(1)
      .max(3)
      .optional()
      .describe("Graph depth (default: 2)"),
  },
  async ({ address, depth }) => {
    const tool = tools.find((t) => t.name === "cluster_wallet")!
    const url = buildUrl(BASE_URL, tool, { address, depth })
    const data = await x402Request(url)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── Tool: batch_screening ($2.50) ─────────────────────────────────

server.tool(
  "batch_screening",
  "Batch AML screening for multiple addresses at once (up to 50). Returns risk level and score per address. 12 chains. Price: $2.50 per batch (fixed, up to 50 addresses).",
  {
    addresses: z
      .array(z.string())
      .min(1)
      .max(50)
      .describe("Addresses to screen"),
    chain: z.string().optional().describe("Chain hint"),
  },
  async ({ addresses, chain }) => {
    const tool = tools.find((t) => t.name === "batch_screening")!
    const url = `${BASE_URL}${tool.endpoint}`
    const data = await x402Request(url, {
      method: "POST",
      body: JSON.stringify({ addresses, chain }),
    })
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── Tool: bridge_flow_trace ($0.50) ───────────────────────────────

server.tool(
  "bridge_flow_trace",
  "Multi-hop cross-chain forensic trace for a wallet address. Auto-detects bridge solvers (NEAR Intents, Wormhole, deBridge, Stargate, Across, Synapse, Hop), follows relay chains across chains, and returns a graph of nodes (solver / relay / user / exchange / bridge) and edges with on-chain tx signatures plus same_intent_correlation. Source chain: EVM chains (including Kaia) or Solana. Price: $0.50 per request.",
  {
    address: z.string().describe("Wallet address to start the trace from"),
    chain: z
      .enum([
        "ethereum",
        "polygon",
        "bsc",
        "base",
        "arbitrum",
        "optimism",
        "avalanche",
        "solana",
        "kaia",
      ])
      .optional()
      .describe("Source chain (default: solana)"),
    max_depth: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe("Max BFS hops (1-4, default: 3). Higher = deeper trace but slower."),
  },
  async ({ address, chain, max_depth }) => {
    const tool = tools.find((t) => t.name === "bridge_flow_trace")!
    const url = `${BASE_URL}${tool.endpoint}`
    const data = await x402Request(url, {
      method: "POST",
      body: JSON.stringify({ address, chain, max_depth }),
    })
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── Start server ──────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(
    `ChainAnalyzer MCP Server running (${BASE_URL}, ` +
      `auth: ${process.env.X402_PRIVATE_KEY ? "x402" : process.env.CHAINANALYZER_API_KEY ? "api-key" : "none"})`,
  )
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
