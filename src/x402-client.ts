/**
 * x402 HTTP Client for ChainAnalyzer MCP Server
 *
 * Two modes:
 * 1. x402 mode (X402_PRIVATE_KEY set): Auto-pays with USDC via x402 protocol
 * 2. API key mode (CHAINANALYZER_API_KEY set): Uses tfk_ key (subscription-based)
 * 3. Dev mode (neither set): Calls endpoints without payment (X402_ENABLED=false on server)
 *
 * The x402 flow:
 *   1. Send request → receive 402 with payment requirements
 *   2. Sign USDC transfer with private key
 *   3. Resend with X-PAYMENT header → receive 200 with result
 */

const DEFAULT_BASE_URL = "https://chain-analyzer.com"

interface X402ClientConfig {
  baseUrl: string
  privateKey?: string
  apiKey?: string
  network?: string
}

function getConfig(): X402ClientConfig {
  return {
    baseUrl: process.env.CHAINANALYZER_BASE_URL || DEFAULT_BASE_URL,
    privateKey: process.env.X402_PRIVATE_KEY,
    apiKey: process.env.CHAINANALYZER_API_KEY,
    network: process.env.X402_NETWORK || "base",
  }
}

/**
 * Make an x402-compatible HTTP request.
 *
 * If x402 private key is configured, handles the 402 → pay → retry flow.
 * If API key is configured, uses Bearer auth instead.
 * Otherwise, makes a plain request (works in dev mode).
 */
export async function x402Request(
  url: string,
  options: { method?: string; body?: string } = {},
): Promise<unknown> {
  const config = getConfig()
  const method = options.method || "GET"

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  // Mode 1: API key auth (subscription)
  if (config.apiKey) {
    headers["X-API-Key"] = config.apiKey
    const resp = await fetch(url, { method, headers, body: options.body })
    if (!resp.ok) {
      throw new Error(
        `ChainAnalyzer API error: ${resp.status} ${await resp.text()}`,
      )
    }
    return resp.json()
  }

  // Mode 2: x402 payment
  if (config.privateKey) {
    return await x402PaymentFlow(url, method, headers, options.body, config)
  }

  // Mode 3: Dev/free mode (no auth)
  const resp = await fetch(url, { method, headers, body: options.body })
  if (resp.status === 402) {
    const paymentInfo = await resp.json()
    throw new Error(
      `Payment required. Set X402_PRIVATE_KEY or CHAINANALYZER_API_KEY.\n` +
        `Price: ${paymentInfo.accepts?.[0]?.price || "unknown"}\n` +
        `Networks: ${paymentInfo.accepts?.map((a: { network: string }) => a.network).join(", ") || "unknown"}`,
    )
  }
  if (!resp.ok) {
    throw new Error(
      `ChainAnalyzer API error: ${resp.status} ${await resp.text()}`,
    )
  }
  return resp.json()
}

/**
 * x402 payment flow:
 * 1. Request → 402
 * 2. Parse payment requirements
 * 3. Sign payment with private key
 * 4. Retry with X-PAYMENT header
 */
async function x402PaymentFlow(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  config: X402ClientConfig,
): Promise<unknown> {
  // Step 1: Initial request
  const initialResp = await fetch(url, { method, headers, body })

  // If not 402, return as-is
  if (initialResp.status !== 402) {
    if (!initialResp.ok) {
      throw new Error(
        `ChainAnalyzer API error: ${initialResp.status} ${await initialResp.text()}`,
      )
    }
    return initialResp.json()
  }

  // Step 2: Parse 402 payment requirements
  const paymentRequired = await initialResp.json()

  if (
    !paymentRequired.accepts ||
    paymentRequired.accepts.length === 0
  ) {
    throw new Error("402 received but no payment options available")
  }

  // Step 3: Create signed payment
  // Try to use x402 SDK if available, otherwise provide manual instructions
  let paymentHeader: string
  try {
    paymentHeader = await createPayment(paymentRequired, config)
  } catch (e) {
    const accepts = paymentRequired.accepts[0]
    throw new Error(
      `x402 payment signing failed: ${e instanceof Error ? e.message : e}\n\n` +
        `To use x402 payments, install the x402 package:\n` +
        `  npm install x402\n\n` +
        `Payment details:\n` +
        `  Price: ${accepts.price}\n` +
        `  Network: ${accepts.network}\n` +
        `  Pay to: ${accepts.payTo}\n`,
    )
  }

  // Step 4: Retry with payment
  headers["X-PAYMENT"] = paymentHeader

  const paidResp = await fetch(url, { method, headers, body })
  if (!paidResp.ok) {
    throw new Error(
      `Payment accepted but request failed: ${paidResp.status} ${await paidResp.text()}`,
    )
  }

  return paidResp.json()
}

/**
 * Create a signed x402 payment using the x402 SDK.
 * Supports both EVM (Base) and Solana networks.
 */
async function createPayment(
  paymentRequired: { accepts: Array<{ network: string; price: string; payTo: string }> },
  config: X402ClientConfig,
): Promise<string> {
  // Dynamic import of x402 SDK
  const x402Module = await import("x402").catch(() => null)

  if (x402Module?.wrapFetchWithPayment) {
    // Use the official x402 SDK wrapper
    const wrappedFetch = x402Module.wrapFetchWithPayment(fetch, {
      privateKey: config.privateKey!,
      network: config.network || "base",
    })

    // The wrapped fetch handles the full 402 flow internally
    // But since we already have the 402 response, we need to
    // use the lower-level signing function
    if (x402Module.createPaymentHeader) {
      return await x402Module.createPaymentHeader(
        paymentRequired,
        config.privateKey!,
        config.network || "base",
      )
    }
  }

  // Fallback: try @x402/core
  const coreModule = await import("@x402/core").catch(() => null)
  if (coreModule?.createPaymentHeader) {
    return await coreModule.createPaymentHeader(
      paymentRequired,
      config.privateKey!,
    )
  }

  throw new Error(
    "x402 SDK not found. Install with: npm install x402",
  )
}
