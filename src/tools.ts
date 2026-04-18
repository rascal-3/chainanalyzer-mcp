/**
 * ChainAnalyzer MCP Tool Definitions
 *
 * 6 AML tools matching the x402 API endpoints.
 * Each tool maps to a pay-per-request endpoint on chain-analyzer.com.
 */

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, unknown>
    required: string[]
  }
  price: string
  endpoint: string
  method: "GET" | "POST"
}

export const tools: ToolDefinition[] = [
  {
    name: "check_address_risk",
    description:
      "Get AML risk score for any blockchain address. " +
      "Returns risk level (CRITICAL/HIGH/MEDIUM/LOW), score (0-100), " +
      "detection details, and ML anomaly score. " +
      "Supports Bitcoin, Ethereum, Polygon, Avalanche, and Solana. " +
      "Auto-detects chain if not specified. Price: $0.008 per request.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Blockchain address to analyze",
        },
        chain: {
          type: "string",
          enum: ["bitcoin", "ethereum", "polygon", "avalanche", "solana"],
          description:
            "Blockchain network (auto-detected if omitted). Required for EVM chains sharing 0x format.",
        },
        lang: {
          type: "string",
          enum: ["en", "ja"],
          description: "Language for detection descriptions (default: en)",
        },
      },
      required: ["address"],
    },
    price: "$0.008",
    endpoint: "/x402/api/address/{address}/risk-score",
    method: "GET",
  },
  {
    name: "sanctions_check",
    description:
      "Screen address against OFAC SDN, FATF, JFSA (Japan), and ChainAnalyzer ScamDB sanctions lists. " +
      "Returns whether the address is sanctioned, which lists matched, and risk level. " +
      "Price: $0.003 per request.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Blockchain address to screen",
        },
        chain: {
          type: "string",
          enum: ["bitcoin", "ethereum", "polygon", "avalanche", "solana"],
          description: "Blockchain network (auto-detected if omitted)",
        },
      },
      required: ["address"],
    },
    price: "$0.003",
    endpoint: "/x402/api/address/{address}/sanctions",
    method: "GET",
  },
  {
    name: "trace_transaction",
    description:
      "Trace fund flows for a transaction with ML-powered anomaly detection. " +
      "Returns Neo4j graph data showing nodes (addresses) and edges (transfers). " +
      "Identifies mixing, layering, and suspicious routing patterns. " +
      "Price: $0.015 per request.",
    inputSchema: {
      type: "object",
      properties: {
        tx_hash: {
          type: "string",
          description: "Transaction hash to trace",
        },
        chain: {
          type: "string",
          description: "Blockchain network",
        },
        depth: {
          type: "number",
          description: "Trace depth, 1-5 (default: 3)",
        },
      },
      required: ["tx_hash"],
    },
    price: "$0.015",
    endpoint: "/x402/api/tx/{tx_hash}/trace",
    method: "GET",
  },
  {
    name: "detect_coinjoin",
    description:
      "Detect CoinJoin, mixing, and tumbling patterns in a Bitcoin transaction. " +
      "Returns whether CoinJoin was detected and related risk detections. " +
      "Price: $0.01 per request.",
    inputSchema: {
      type: "object",
      properties: {
        tx_hash: {
          type: "string",
          description: "Bitcoin transaction hash to analyze",
        },
      },
      required: ["tx_hash"],
    },
    price: "$0.01",
    endpoint: "/x402/api/tx/{tx_hash}/coinjoin",
    method: "GET",
  },
  {
    name: "cluster_wallet",
    description:
      "Identify related addresses through Neo4j graph clustering analysis. " +
      "Returns cluster size, related addresses, and graph structure. " +
      "Useful for entity resolution and tracing fund networks. " +
      "Price: $0.02 per request.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Starting address for cluster analysis",
        },
        depth: {
          type: "number",
          description: "Graph traversal depth, 1-3 (default: 2)",
        },
      },
      required: ["address"],
    },
    price: "$0.02",
    endpoint: "/x402/api/wallet/{address}/cluster",
    method: "GET",
  },
  {
    name: "batch_screening",
    description:
      "Batch AML screening for multiple addresses at once (up to 50). " +
      "Returns risk level and score for each address. " +
      "More cost-effective than individual checks for bulk analysis. " +
      "Price: $0.05 per batch.",
    inputSchema: {
      type: "object",
      properties: {
        addresses: {
          type: "array",
          items: { type: "string" },
          description: "List of blockchain addresses to screen (max 50)",
        },
        chain: {
          type: "string",
          description:
            "Blockchain network hint (addresses on different chains are auto-detected)",
        },
      },
      required: ["addresses"],
    },
    price: "$0.05",
    endpoint: "/x402/api/batch/screening",
    method: "POST",
  },
]

/** Build the URL for a tool call, substituting path parameters */
export function buildUrl(
  baseUrl: string,
  tool: ToolDefinition,
  args: Record<string, unknown>,
): string {
  let path = tool.endpoint

  // Substitute path parameters like {address}, {tx_hash}
  path = path.replace(/\{(\w+)\}/g, (_, key) => {
    const value = args[key]
    if (typeof value === "string") return encodeURIComponent(value)
    return ""
  })

  // Add query parameters for GET requests
  if (tool.method === "GET") {
    const queryParams: string[] = []
    for (const [key, value] of Object.entries(args)) {
      // Skip path parameters already substituted
      if (tool.endpoint.includes(`{${key}}`)) continue
      if (value !== undefined && value !== null) {
        queryParams.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        )
      }
    }
    if (queryParams.length > 0) {
      path += "?" + queryParams.join("&")
    }
  }

  return `${baseUrl}${path}`
}
