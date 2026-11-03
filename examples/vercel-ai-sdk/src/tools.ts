/**
 * Vercel AI SDK tools for ChainAnalyzer AML screening.
 *
 *   import { chainAnalyzerTools } from "./tools"
 *   await generateText({ model, tools: chainAnalyzerTools(), prompt })
 *
 * x402 prices: sanctions $0.50, hack exposure $0.50, risk score $1.00 (USDC on Base).
 */
import { tool } from "ai"
import { z } from "zod"
import { CHAINS, ChainAnalyzerClient, DISCLAIMER, HACK_CHAINS, PRICES_USD } from "./chainanalyzer-client.js"

const address = z.string().describe("Blockchain address, exactly as received (do not lowercase base58).")

async function wrap(call: () => Promise<unknown>) {
  try {
    return { result: await call(), disclaimer: DISCLAIMER }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export function chainAnalyzerTools(client: ChainAnalyzerClient = new ChainAnalyzerClient()) {
  return {
    chainanalyzer_sanctions_check: tool({
      description:
        "Screen a blockchain address against OFAC / FATF / JFSA sanctions lists across 12 chains. " +
        `Returns sanctioned true/false and matched lists. Costs $${PRICES_USD.sanctions} USDC per call.`,
      inputSchema: z.object({
        address,
        chain: z.enum(CHAINS).optional().describe("Chain; auto-detected if omitted."),
      }),
      execute: ({ address, chain }) => wrap(() => client.sanctions(address, chain)),
    }),

    chainanalyzer_hack_exposure: tool({
      description:
        "Is this address connected to a known hack (published incidents only)? Returns verdict, hop distance " +
        `from the attacker, role and lower-bound amounts. Costs $${PRICES_USD.hackExposure} USDC per call.`,
      inputSchema: z.object({
        address,
        chain: z
          .enum(HACK_CHAINS)
          .optional()
          .describe("Narrow to one chain; an EVM address is matched on every EVM chain if omitted."),
      }),
      execute: ({ address, chain }) => wrap(() => client.hackExposure(address, chain)),
    }),

    chainanalyzer_risk_score: tool({
      description:
        "Full AML risk score (0-100, severity, detections from 76+ rules, ML anomaly score) with a free " +
        `hack_exposure summary. Costs $${PRICES_USD.riskScore} USDC per call.`,
      inputSchema: z.object({
        address,
        chain: z.enum(CHAINS).optional().describe("Chain; auto-detected if omitted."),
        lang: z.enum(["en", "ja"]).optional().describe("Language of text fields (default en)."),
      }),
      execute: ({ address, chain, lang }) => wrap(() => client.riskScore(address, chain, lang)),
    }),
  }
}
