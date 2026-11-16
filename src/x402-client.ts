/**
 * HTTP client for the ChainAnalyzer MCP server.
 *
 * Three modes:
 * 1. API key mode (CHAINANALYZER_API_KEY set): X-API-Key header, billed to the plan. Wins if both are set.
 * 2. x402 mode (X402_PRIVATE_KEY set): pays each call in USDC on Base mainnet via x402 v2.
 *    `@x402/fetch` handles 402 -> sign (EIP-3009, exact scheme) -> resend with the payment header.
 * 3. No auth (neither set): plain request; a 402 is reported with the quoted price.
 *
 * x402 safety rails:
 * - X402_MAX_USD_PER_CALL (default 1.00) caps a single payment. A quote above the cap is refused
 *   before anything is signed.
 * - Only Base mainnet (eip155:8453) is registered. X402_NETWORK other than "base" is an error.
 * - The private key is never logged or put into an error message.
 * - The server settles only after a successful (2xx) response, so a failed call is not charged.
 */

import { wrapFetchWithPayment, x402Client } from "@x402/fetch"
import { ExactEvmScheme } from "@x402/evm"
import { privateKeyToAccount } from "viem/accounts"

const DEFAULT_BASE_URL = "https://chain-analyzer.com"
export const BASE_MAINNET = "eip155:8453"
export const DEFAULT_MAX_USD_PER_CALL = "1.00"
const USDC_DECIMALS = 6

type Env = Record<string, string | undefined>

export interface RequestDeps {
  /** Replaces the global fetch (tests). */
  fetch?: typeof fetch
  /** Replaces process.env (tests). */
  env?: Env
}

interface PaymentAccept {
  scheme?: string
  network?: string
  amount?: string
  maxAmountRequired?: string
  payTo?: string
}

export class X402ConfigError extends Error {}
export class X402PaymentError extends Error {}

/** USDC atomic units (6 decimals) -> "$0.10". */
export function formatUsd(amount: string | undefined): string {
  if (amount === undefined || !/^\d+$/.test(amount)) return "unknown"
  return `$${(Number(amount) / 10 ** USDC_DECIMALS).toFixed(2)}`
}

function parseMaxUsd(raw: string | undefined): number {
  const value = (raw ?? DEFAULT_MAX_USD_PER_CALL).trim().replace(/^\$/, "")
  const n = Number(value)
  if (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(n) || n <= 0) {
    throw new X402ConfigError(
      `X402_MAX_USD_PER_CALL must be a positive dollar amount such as 1.00 (got ${JSON.stringify(raw)}).`,
    )
  }
  return n
}

function checkNetwork(raw: string | undefined): void {
  const v = (raw ?? "base").trim().toLowerCase()
  if (v === "" || v === "base" || v === BASE_MAINNET) return
  throw new X402ConfigError(
    `X402_NETWORK=${JSON.stringify(raw)} is not supported. This MCP server pays with USDC on Base mainnet only ` +
      `(set X402_NETWORK=base or leave it unset).`,
  )
}

function parsePrivateKey(raw: string): `0x${string}` {
  const key = raw.trim()
  const normalized = key.startsWith("0x") ? key : `0x${key}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    // Never echo the value.
    throw new X402ConfigError("X402_PRIVATE_KEY must be a 32-byte hex EVM private key (0x followed by 64 hex characters).")
  }
  return normalized as `0x${string}`
}

/** Payment requirements from a 402: the PAYMENT-REQUIRED header (v2), else the JSON body. */
function readPaymentRequired(headerValue: string | null, bodyText: string): { accepts?: PaymentAccept[] } | null {
  if (headerValue) {
    try {
      return JSON.parse(Buffer.from(headerValue, "base64").toString("utf8"))
    } catch {
      // fall through to the body
    }
  }
  try {
    return JSON.parse(bodyText)
  } catch {
    return null
  }
}

function acceptAmount(a: PaymentAccept): string | undefined {
  return a.amount ?? a.maxAmountRequired
}

function hasPaymentHeader(req: Request): boolean {
  return req.headers.has("PAYMENT-SIGNATURE") || req.headers.has("X-PAYMENT")
}

/** Human-readable reason for a non-2xx response, including the server's hint when present. */
function describeFailure(status: number, bodyText: string, paid: boolean): string {
  let body: Record<string, unknown> | null = null
  try {
    body = JSON.parse(bodyText)
  } catch {
    body = null
  }
  const parts: string[] = []
  if (paid && status === 402) {
    parts.push("ChainAnalyzer did not accept the x402 payment. Nothing was charged.")
  } else if (paid) {
    parts.push(
      `ChainAnalyzer API error ${status}. The server settles a payment only after a successful response, ` +
        "so this call was not charged.",
    )
  } else {
    parts.push(`ChainAnalyzer API error ${status}.`)
  }
  if (body) {
    for (const key of ["error", "stage", "reason", "detail"] as const) {
      const v = body[key]
      if (typeof v === "string" && v) parts.push(`${key}: ${v.slice(0, 300)}`)
    }
    const hint = body.hint as { code?: string; message?: string } | undefined
    if (hint && typeof hint === "object") {
      if (hint.code) parts.push(`hint: ${hint.code}`)
      if (hint.code === "payer_has_eip7702_delegation") {
        parts.push(
          "The paying address has an EIP-7702 delegation (it was turned into a smart account), so the USDC " +
            "signature check on Base fails. Use the key of an address with no delegation.",
        )
      } else if (hint.code === "payer_is_contract") {
        parts.push("The paying address is a smart contract wallet. Use the key of a plain address (EOA).")
      }
      if (hint.message) parts.push(hint.message)
    }
  } else if (bodyText) {
    parts.push(bodyText.slice(0, 300))
  }
  return parts.join("\n")
}

/**
 * Make a request to ChainAnalyzer using whichever auth mode is configured.
 */
export async function x402Request(
  url: string,
  options: { method?: string; body?: string } = {},
  deps: RequestDeps = {},
): Promise<unknown> {
  const env: Env = deps.env ?? process.env
  const baseFetch: typeof fetch = deps.fetch ?? fetch
  const method = options.method || "GET"
  const headers: Record<string, string> = { Accept: "application/json" }
  if (options.body !== undefined) headers["Content-Type"] = "application/json"

  // Mode 1: API key (subscription)
  const apiKey = env.CHAINANALYZER_API_KEY
  if (apiKey) {
    const resp = await baseFetch(url, { method, headers: { ...headers, "X-API-Key": apiKey }, body: options.body })
    if (!resp.ok) throw new Error(describeFailure(resp.status, await resp.text(), false))
    return resp.json()
  }

  // Mode 2: x402 payment
  const rawKey = env.X402_PRIVATE_KEY
  if (rawKey) {
    return x402PaidRequest(url, method, headers, options.body, rawKey, env, baseFetch)
  }

  // Mode 3: no auth
  const resp = await baseFetch(url, { method, headers, body: options.body })
  if (resp.status === 402) {
    const text = await resp.text()
    const req = readPaymentRequired(resp.headers.get("PAYMENT-REQUIRED"), text)
    const offers = (req?.accepts ?? []).map((a) => `${formatUsd(acceptAmount(a))} USDC on ${a.network ?? "unknown"}`)
    throw new Error(
      "Payment required. Set CHAINANALYZER_API_KEY (any plan, Free included) or X402_PRIVATE_KEY " +
        "(pays per call in USDC on Base).\n" +
        `Price: ${offers.length ? offers.join(" / ") : "unknown"}`,
    )
  }
  if (!resp.ok) throw new Error(describeFailure(resp.status, await resp.text(), false))
  return resp.json()
}

async function x402PaidRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  rawKey: string,
  env: Env,
  baseFetch: typeof fetch,
): Promise<unknown> {
  checkNetwork(env.X402_NETWORK)
  const maxUsd = parseMaxUsd(env.X402_MAX_USD_PER_CALL)
  const privateKey = parsePrivateKey(rawKey)

  let account
  try {
    account = privateKeyToAccount(privateKey)
  } catch {
    throw new X402ConfigError("X402_PRIVATE_KEY is not a valid EVM private key.")
  }

  const payer = new x402Client()
    .register(BASE_MAINNET, new ExactEvmScheme(account))
    .setSpendControls({ maxAmountPerPayment: `$${maxUsd}` })

  // Checks the quote of the first (unpaid) 402 before @x402/fetch signs anything, so that an
  // over-cap price or a missing Base option produces a clear error and no payment.
  const guardedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const resp = await baseFetch(input, init)
    const req = input instanceof Request ? input : new Request(input, init)
    if (resp.status !== 402 || hasPaymentHeader(req)) return resp

    const text = await resp.clone().text()
    const required = readPaymentRequired(resp.headers.get("PAYMENT-REQUIRED"), text)
    const base = (required?.accepts ?? []).find((a) => a.network === BASE_MAINNET && a.scheme === "exact")
    if (!base) {
      throw new X402PaymentError(
        "ChainAnalyzer did not offer a USDC-on-Base payment option for this call, so nothing was paid.",
      )
    }
    const amount = acceptAmount(base)
    if (!amount || !/^\d+$/.test(amount)) {
      throw new X402PaymentError("ChainAnalyzer returned a 402 without a readable price, so nothing was paid.")
    }
    if (Number(amount) / 10 ** USDC_DECIMALS > maxUsd) {
      throw new X402PaymentError(
        `This call costs ${formatUsd(amount)} USDC, above the per-call limit of $${maxUsd.toFixed(2)} ` +
          `(X402_MAX_USD_PER_CALL). Nothing was paid. Raise X402_MAX_USD_PER_CALL (for example to ` +
          `${formatUsd(amount).slice(1)}) to allow it.`,
      )
    }
    return resp
  }) as typeof fetch

  const payingFetch = wrapFetchWithPayment(guardedFetch, payer)

  let resp: Response
  try {
    resp = await payingFetch(url, { method, headers, body })
  } catch (err) {
    if (err instanceof X402PaymentError || err instanceof X402ConfigError) throw err
    // Messages come from fetch / @x402. Redact the key defensively before surfacing them.
    const msg = (err instanceof Error ? err.message : String(err))
      .split(privateKey).join("[redacted]")
      .split(privateKey.slice(2)).join("[redacted]")
    throw new X402PaymentError(`x402 payment could not be completed (nothing was charged): ${msg.slice(0, 500)}`)
  }

  if (!resp.ok) throw new Error(describeFailure(resp.status, await resp.text(), true))
  return resp.json()
}
