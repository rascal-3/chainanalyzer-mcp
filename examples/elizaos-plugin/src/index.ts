/**
 * ElizaOS plugin skeleton: ChainAnalyzer AML screening actions.
 *
 * Actions: CHAINANALYZER_SANCTIONS_CHECK ($0.50), CHAINANALYZER_HACK_EXPOSURE ($0.50),
 *          CHAINANALYZER_RISK_SCORE ($1.00) - USDC per call in x402 mode.
 *
 * Settings (character `settings.secrets` or environment; never hard-coded):
 *   CHAINANALYZER_API_KEY | X402_PRIVATE_KEY, optional CHAINANALYZER_MAX_USD_PER_CALL, CHAINANALYZER_DRY_RUN
 */
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Plugin,
} from "@elizaos/core"
import { ChainAnalyzerClient, DISCLAIMER, PRICES_USD, type Chain } from "./chainanalyzer-client.js"

// EVM, TRON (T...), Bitcoin (bc1/1/3), XRP (r...), Solana (base58 32-44). Case is preserved.
const ADDRESS_RE =
  /\b(0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33}|bc1[a-z0-9]{25,62}|[13][1-9A-HJ-NP-Za-km-z]{25,34}|r[1-9A-HJ-NP-Za-km-z]{24,34}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/
const CHAIN_RE =
  /\b(bitcoin|ethereum|polygon|bsc|base|arbitrum|optimism|avalanche|solana|kaia|tron|xrp)\b/i

function extract(message: Memory): { address?: string; chain?: Chain } {
  const text = message.content.text ?? ""
  return {
    address: text.match(ADDRESS_RE)?.[1],
    chain: text.match(CHAIN_RE)?.[1]?.toLowerCase() as Chain | undefined,
  }
}

function setting(runtime: IAgentRuntime, key: string): string | undefined {
  const v = runtime.getSetting(key)
  return v === null || v === undefined || v === "" ? undefined : String(v)
}

let cached: ChainAnalyzerClient | undefined
function clientFor(runtime: IAgentRuntime): ChainAnalyzerClient {
  cached ??= new ChainAnalyzerClient({
    apiKey: setting(runtime, "CHAINANALYZER_API_KEY"),
    privateKey: setting(runtime, "X402_PRIVATE_KEY") as `0x${string}` | undefined,
    maxUsdPerCall: setting(runtime, "CHAINANALYZER_MAX_USD_PER_CALL"),
    dryRun: setting(runtime, "CHAINANALYZER_DRY_RUN") === "1",
  })
  return cached
}

function hasAuth(runtime: IAgentRuntime): boolean {
  return Boolean(setting(runtime, "CHAINANALYZER_API_KEY") || setting(runtime, "X402_PRIVATE_KEY"))
}

function makeAction(spec: {
  name: string
  similes: string[]
  description: string
  example: string
  call: (c: ChainAnalyzerClient, address: string, chain?: Chain) => Promise<unknown>
}): Action {
  return {
    name: spec.name,
    similes: spec.similes,
    description: spec.description,
    validate: async (runtime, message) => hasAuth(runtime) && Boolean(extract(message).address),
    handler: async (runtime, message, _state, _options, callback?: HandlerCallback): Promise<ActionResult> => {
      const { address, chain } = extract(message)
      if (!address) return { success: false, error: "No blockchain address found in the message." }
      try {
        const result = await spec.call(clientFor(runtime), address, chain)
        const text = `${spec.name} for ${address}:\n${JSON.stringify(result, null, 2)}\n\n${DISCLAIMER}`
        await callback?.({ text, actions: [spec.name] })
        return { success: true, text, data: { address, chain, result } }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await callback?.({ text: `ChainAnalyzer error: ${msg}` })
        return { success: false, error: msg }
      }
    },
    examples: [
      [
        { name: "{{user}}", content: { text: spec.example } },
        { name: "{{agent}}", content: { text: "Screening that address with ChainAnalyzer.", actions: [spec.name] } },
      ],
    ],
  }
}

export const sanctionsAction = makeAction({
  name: "CHAINANALYZER_SANCTIONS_CHECK",
  similes: ["SANCTIONS_CHECK", "OFAC_CHECK", "SCREEN_ADDRESS"],
  description: `Screen a blockchain address against OFAC / FATF / JFSA sanctions lists. Costs $${PRICES_USD.sanctions} USDC per call.`,
  example: "Is 0x7f367cC41522cE07553e823bf3be79A889DEbe1B sanctioned?",
  call: (c, a, ch) => c.sanctions(a, ch),
})

export const hackExposureAction = makeAction({
  name: "CHAINANALYZER_HACK_EXPOSURE",
  similes: ["HACK_EXPOSURE", "STOLEN_FUNDS_CHECK"],
  description:
    "Is this address connected to a known hack (published incidents only)? Lower-bound taint, hop distance and role. " +
    `Costs $${PRICES_USD.hackExposure} USDC per call.`,
  example: "Is 0x0000db5c8b030ae20308ac975898e09741e70000 connected to any hack?",
  call: (c, a, ch) => c.hackExposure(a, ch === "xrp" ? undefined : ch),
})

export const riskScoreAction = makeAction({
  name: "CHAINANALYZER_RISK_SCORE",
  similes: ["AML_RISK_SCORE", "WALLET_RISK", "KYT_CHECK"],
  description: `Full AML risk score (0-100, severity, detections, ML anomaly score). Costs $${PRICES_USD.riskScore} USDC per call.`,
  example: "Give me the AML risk score for 0x0000db5c8b030ae20308ac975898e09741e70000 on ethereum",
  call: (c, a, ch) => c.riskScore(a, ch),
})

export const chainAnalyzerPlugin: Plugin = {
  name: "chainanalyzer",
  description:
    "Crypto AML screening (sanctions, known-hack exposure, risk score) across 12 chains via ChainAnalyzer, paid per call with x402 or an API key.",
  actions: [sanctionsAction, hackExposureAction, riskScoreAction],
}

export default chainAnalyzerPlugin
