/**
 * Minimal ChainAnalyzer AML API client: API key or x402 (USDC on Base mainnet).
 *
 * Auth (options first, then environment; never hard-code secrets):
 *   apiKey     / CHAINANALYZER_API_KEY=tfk_...  -> X-API-Key header, billed to your plan
 *   privateKey / X402_PRIVATE_KEY=0x...         -> pay per call via x402 (EIP-3009, facilitator settles)
 * If both are set the API key wins.
 *
 * Safety rails:
 *   maxUsdPerCall / CHAINANALYZER_MAX_USD_PER_CALL (default 1.00) -> x402 spend controls, enforced before signing
 *   dryRun        / CHAINANALYZER_DRY_RUN=1                       -> abort before signing, return the quoted price
 */
import { wrapFetchWithPayment, x402Client } from "@x402/fetch"
import { ExactEvmScheme } from "@x402/evm"
import { privateKeyToAccount } from "viem/accounts"

export const BASE_MAINNET = "eip155:8453" as const

/** x402 prices in USDC (the live list is at https://chain-analyzer.com/x402/api/discover). */
export const PRICES_USD = {
  riskScore: "1.00",
  sanctions: "0.50",
  hackExposure: "0.50",
  freezeStatus: "0.10",
  hackExposureBatch: "5.00",
} as const

export const CHAINS = [
  "bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum",
  "optimism", "avalanche", "solana", "kaia", "tron", "xrp",
] as const
export type Chain = (typeof CHAINS)[number]

/** hack-exposure covers EVM chains, TRON, Solana and Bitcoin (no XRP). */
export const HACK_CHAINS = [
  "bitcoin", "ethereum", "polygon", "bsc", "base", "arbitrum",
  "optimism", "avalanche", "solana", "kaia", "tron",
] as const
export type HackChain = (typeof HACK_CHAINS)[number]

export const DISCLAIMER =
  "Automated screening signal, not a legal determination. Hack exposure is a lower-bound taint over " +
  "published incidents only; absence of a match or of a freeze is not proof that funds are clean. Keep a " +
  "human in the loop for crediting, freezing or reporting decisions."

export interface ChainAnalyzerOptions {
  /** Default https://chain-analyzer.com (or CHAINANALYZER_BASE_URL). */
  baseUrl?: string
  /** tfk_ API key (or CHAINANALYZER_API_KEY). Wins over privateKey when both are set. */
  apiKey?: string
  /** Hex private key of a dedicated low-balance wallet holding USDC on Base (or X402_PRIVATE_KEY). */
  privateKey?: `0x${string}`
  /** Hard cap per payment in USD, enforced before signing (default "1.00"). */
  maxUsdPerCall?: string
  /** Stop before signing and return the quoted price instead of paying. */
  dryRun?: boolean
}

export class ChainAnalyzerClient {
  readonly baseUrl: string
  readonly mode: "api_key" | "x402"
  private readonly doFetch: typeof fetch
  private readonly headers: Record<string, string> = { Accept: "application/json" }
  private quoted: Record<string, unknown> | null = null

  constructor(opts: ChainAnalyzerOptions = {}) {
    const env = typeof process !== "undefined" ? process.env : {}
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

  private async request(
    method: "GET" | "POST",
    path: string,
    params: Record<string, string | undefined> = {},
    body?: unknown,
  ): Promise<unknown> {
    const url = new URL(this.baseUrl + path)
    for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v)
    this.quoted = null
    const headers = body === undefined ? this.headers : { ...this.headers, "Content-Type": "application/json" }
    let resp: Response
    try {
      resp = await this.doFetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
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

  /** $0.50 — OFAC / EU / UK / UN / JFSA sanctions and ScamDB. */
  sanctions(address: string, chain?: Chain) {
    return this.request("GET", `/x402/api/address/${encodeURIComponent(address)}/sanctions`, { chain })
  }
  /** $0.50 — connection to a known (published) hack: verdict, hops from the attacker, role, lower-bound amounts. */
  hackExposure(address: string, chain?: HackChain) {
    return this.request("GET", `/x402/api/address/${encodeURIComponent(address)}/hack-exposure`, { chain })
  }
  /** $1.00 — full AML risk score; includes free hack_exposure and freeze_status summaries. */
  riskScore(address: string, chain?: Chain, lang?: "en" | "ja") {
    return this.request("GET", `/x402/api/address/${encodeURIComponent(address)}/risk-score`, { chain, lang })
  }
  /** $0.10 — is the address frozen / blacklisted by a stablecoin issuer (USDT, USDC, JPYC …)? */
  freezeStatus(address: string, chain?: Chain) {
    return this.request("GET", `/x402/api/address/${encodeURIComponent(address)}/freeze-status`, { chain })
  }
  /** $5.00 per call — known-hack exposure for up to 50 addresses. */
  hackExposureBatch(addresses: string[], chain?: HackChain) {
    return this.request("POST", "/x402/api/hack-exposure/batch", {}, { addresses, chain })
  }
}
