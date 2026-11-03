/**
 * ChainAnalyzer AML tools for the Vercel AI SDK.
 *
 *   import { generateText } from "ai"
 *   import { chainAnalyzerTools } from "@chainanalyzer/ai-sdk"
 *   await generateText({ model, tools: chainAnalyzerTools(), prompt })
 *
 * Pay per call in USDC on Base via x402 (X402_PRIVATE_KEY) or use a tfk_ API key (CHAINANALYZER_API_KEY).
 */
import { tool } from "ai"
import { z } from "zod"
import {
  CHAINS,
  ChainAnalyzerClient,
  DISCLAIMER,
  HACK_CHAINS,
  PRICES_USD,
  type ChainAnalyzerOptions,
} from "./client.js"

export * from "./client.js"

export interface ChainAnalyzerToolsOptions extends ChainAnalyzerOptions {
  /** Reuse an existing client instead of building one from the options. */
  client?: ChainAnalyzerClient
  /**
   * Include the $5.00 batch tool. Off by default so an agent cannot spend $5 in one step
   * unless you opt in (also raise maxUsdPerCall to at least "5.00").
   */
  includeBatch?: boolean
}

const address = z.string().describe("Blockchain address, exactly as received (do not lowercase base58).")

async function wrap(call: () => Promise<unknown>) {
  try {
    return { result: await call(), disclaimer: DISCLAIMER }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export function chainAnalyzerTools(options: ChainAnalyzerToolsOptions = {}) {
  const client = options.client ?? new ChainAnalyzerClient(options)
  const tools = {
    chainanalyzer_sanctions_check: tool({
      description:
        "Screen a blockchain address against sanctions lists (OFAC, EU, UK, UN, JFSA) and ScamDB across 12 chains. " +
        `Costs $${PRICES_USD.sanctions} USDC per call. Call this first; a hit is enough to stop and report.`,
      inputSchema: z.object({
        address,
        chain: z.enum(CHAINS).optional().describe("Chain; auto-detected if omitted."),
      }),
      execute: ({ address, chain }) => wrap(() => client.sanctions(address, chain)),
    }),

    chainanalyzer_hack_exposure: tool({
      description:
        "Is this address connected to a known hack (published incidents only, e.g. the 2026 Binance hack)? " +
        "Returns a verdict, hop distance from the attacker, role and lower-bound amounts per incident. " +
        `Costs $${PRICES_USD.hackExposure} USDC per call.`,
      inputSchema: z.object({
        address,
        chain: z
          .enum(HACK_CHAINS)
          .optional()
          .describe("Narrow to one chain; an EVM address is matched on every EVM chain if omitted."),
      }),
      execute: ({ address, chain }) => wrap(() => client.hackExposure(address, chain)),
    }),

    chainanalyzer_freeze_status: tool({
      description:
        "Is this address frozen or blacklisted by a stablecoin issuer (USDT, USDC, JPYC and others)? Returns the " +
        `current state per token with timestamps and the tokens covered. Costs $${PRICES_USD.freezeStatus} USDC per call.`,
      inputSchema: z.object({
        address,
        chain: z.enum(CHAINS).optional().describe("Chain; every indexed EVM chain is checked if omitted."),
      }),
      execute: ({ address, chain }) => wrap(() => client.freezeStatus(address, chain)),
    }),

    chainanalyzer_risk_score: tool({
      description:
        "Full AML risk score (0-100, severity, detections from 76+ rules, ML anomaly score) with free hack-exposure " +
        `and freeze-status summaries. Costs $${PRICES_USD.riskScore} USDC per call.`,
      inputSchema: z.object({
        address,
        chain: z.enum(CHAINS).optional().describe("Chain; auto-detected if omitted."),
        lang: z.enum(["en", "ja"]).optional().describe("Language of text fields (default en)."),
      }),
      execute: ({ address, chain, lang }) => wrap(() => client.riskScore(address, chain, lang)),
    }),
  }
  if (!options.includeBatch) return tools
  return {
    ...tools,
    chainanalyzer_hack_exposure_batch: tool({
      description:
        "Known-hack exposure for up to 50 addresses in one call (deposit-list screening). " +
        `Costs $${PRICES_USD.hackExposureBatch} USDC per call regardless of the number of addresses.`,
      inputSchema: z.object({
        addresses: z.array(z.string()).min(1).max(50).describe("Addresses exactly as received."),
        chain: z.enum(HACK_CHAINS).optional(),
      }),
      execute: ({ addresses, chain }) => wrap(() => client.hackExposureBatch(addresses, chain)),
    }),
  }
}
