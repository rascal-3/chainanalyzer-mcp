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
  version: "1.0.0",
})

// ── Tool: check_address_risk ($0.008) ─────────────────────────────

server.tool(
  "check_address_risk",
  "Get AML risk score for any blockchain address. Returns risk level, score (0-100), detections, and ML anomaly score. Supports BTC, ETH, POL, BNB, BASE, ARB, OP, AVAX, SOL.",
  {
    address: z.string().describe("Blockchain address to analyze"),
    chain: z
      .enum(["bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum", "optimism", "avalanche", "solana"])
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

// ── Tool: sanctions_check ($0.003) ────────────────────────────────

server.tool(
  "sanctions_check",
  "Screen address against OFAC, FATF, JFSA, and ChainAnalyzer ScamDB sanctions lists.",
  {
    address: z.string().describe("Blockchain address to screen"),
    chain: z
      .enum(["bitcoin", "ethereum", "polygon", "avalanche", "solana"])
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

// ── Tool: trace_transaction ($0.015) ──────────────────────────────

server.tool(
  "trace_transaction",
  "Trace fund flows for a transaction with ML anomaly detection. Returns graph of addresses and transfers.",
  {
    tx_hash: z.string().describe("Transaction hash to trace"),
    chain: z.string().optional().describe("Blockchain network"),
    depth: z
      .number()
      .min(1)
      .max(5)
      .optional()
      .describe("Trace depth (default: 3)"),
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

// ── Tool: detect_coinjoin ($0.01) ─────────────────────────────────

server.tool(
  "detect_coinjoin",
  "Detect CoinJoin, mixing, and tumbling patterns in a Bitcoin transaction.",
  {
    tx_hash: z.string().describe("Bitcoin transaction hash"),
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

// ── Tool: cluster_wallet ($0.02) ──────────────────────────────────

server.tool(
  "cluster_wallet",
  "Identify related addresses through Neo4j graph clustering. Returns cluster size and related addresses.",
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

// ── Tool: batch_screening ($0.05) ─────────────────────────────────

server.tool(
  "batch_screening",
  "Batch AML screening for multiple addresses at once (up to 50). Returns risk level and score per address.",
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
