/**
 * Minimal ChainAnalyzer AML API client: API key or x402 (USDC on Base mainnet).
 *
 * Auth (environment only, never hard-coded):
 *   CHAINANALYZER_API_KEY=tfk_...  -> X-API-Key header, billed to your plan
 *   X402_PRIVATE_KEY=0x...         -> pay per call via x402 (EIP-3009, facilitator settles)
 * If both are set the API key wins.
 *
 * Safety rails:
 *   CHAINANALYZER_MAX_USD_PER_CALL (default 1.00) -> x402 spend controls, enforced before signing
 *   CHAINANALYZER_DRY_RUN=1                       -> abort before signing, return the quoted price
 */
import { wrapFetchWithPayment, x402Client } from "@x402/fetch"
import { ExactEvmScheme } from "@x402/evm"
import { privateKeyToAccount } from "viem/accounts"

export const BASE_MAINNET = "eip155:8453" as const

export const PRICES_USD = {
  riskScore: "1.00",
  sanctions: "0.50",
  hackExposure: "0.50",
} as const

export const CHAINS = [
  "bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum",
  "optimism", "avalanche", "solana", "kaia", "tron", "xrp",
] as const
/** hack-exposure covers EVM chains, TRON, Solana and Bitcoin (no XRP). */
export const HACK_CHAINS = CHAINS.filter((c) => c !== "xrp") as unknown as readonly [
  Exclude<(typeof CHAINS)[number], "xrp">,
  ...Exclude<(typeof CHAINS)[number], "xrp">[],
]
export type Chain = (typeof CHAINS)[number]

export const DISCLAIMER =
  "Automated screening signal, not a legal determination. Hack exposure is a lower-bound taint over " +
  "published incidents only; absence of a match is not proof that funds are clean. Keep a human in the " +
  "loop for crediting, freezing or reporting decisions."

export interface ChainAnalyzerOptions {
  baseUrl?: string
  apiKey?: string
  privateKey?: `0x${string}`
  maxUsdPerCall?: string
  dryRun?: boolean
}

export class ChainAnalyzerClient {
  readonly baseUrl: string
  readonly mode: "api_key" | "x402"
  private readonly doFetch: typeof fetch
  private readonly headers: Record<string, string> = { Accept: "application/json" }
  private quoted: Record<string, unknown> | null = null

  constructor(opts: ChainAnalyzerOptions = {}) {
    const env = process.env
    this.baseUrl = (opts.baseUrl ?? env.CHAINANALYZER_BASE_URL ?? "https://chain-analyzer.com").replace(/\/$/, "")
    const apiKey = opts.apiKey ?? env.CHAINANALYZER_API_KEY
    const privateKey = opts.privateKey ?? (env.X402_PRIVATE_KEY as `0x${string}` | undefined)
    const maxUsd = opts.maxUsdPerCall ?? env.CHAINANALYZER_MAX_USD_PER_CALL ?? "1.00"
    const dryRun = opts.dryRun ?? env.CHAINANALYZER_DRY_RUN === "1"

    if (apiKey) {
      this.mode = "api_key"
      this.headers["X-API-Key"] = apiKey
      this.doFetch = fetch
      return
    }
    if (!privateKey) {
      throw new Error("Set CHAINANALYZER_API_KEY (subscription) or X402_PRIVATE_KEY (pay per call in USDC on Base).")
    }
    this.mode = "x402"
    // Only Base mainnet is registered, so the Solana option in the 402 response is ignored.
    const payer = new x402Client()
      .register(BASE_MAINNET, new ExactEvmScheme(privateKeyToAccount(privateKey)))
      .setSpendControls({ maxAmountPerPayment: `$${maxUsd}` })
    if (dryRun) {
      payer.onBeforePaymentCreation(async ({ selectedRequirements: r }) => {
        this.quoted = { network: r.network, amount_usdc: Number(r.amount) / 1e6, pay_to: r.payTo }
        return { abort: true, reason: "dry_run" }
      })
    }
    this.doFetch = wrapFetchWithPayment(fetch, payer) as typeof fetch
  }

  async get(path: string, params: Record<string, string | undefined> = {}): Promise<unknown> {
    const url = new URL(this.baseUrl + path)
    for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v)
    this.quoted = null
    let resp: Response
    try {
      resp = await this.doFetch(url, { headers: this.headers })
    } catch (err) {
      if (this.quoted) return { dry_run: true, would_pay: this.quoted, url: url.toString() }
      throw new Error(`ChainAnalyzer request failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (resp.status === 402) {
      throw new Error("402 Payment Required: payment not accepted (USDC balance on Base, per-call cap, or plan).")
    }
    if (!resp.ok) throw new Error(`ChainAnalyzer HTTP ${resp.status}: ${(await resp.text()).slice(0, 500)}`)
    return resp.json()
  }

  sanctions(address: string, chain?: Chain) {
    return this.get(`/x402/api/address/${encodeURIComponent(address)}/sanctions`, { chain })
  }
  hackExposure(address: string, chain?: Chain) {
    return this.get(`/x402/api/address/${encodeURIComponent(address)}/hack-exposure`, { chain })
  }
  riskScore(address: string, chain?: Chain, lang?: "en" | "ja") {
    return this.get(`/x402/api/address/${encodeURIComponent(address)}/risk-score`, { chain, lang })
  }
}
