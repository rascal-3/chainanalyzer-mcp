// Unit tests for the x402 payment mode. No real payment is made: fetch is replaced by a stub
// and the key is generated fresh for every run.
// Run with `npm test` (builds first, then `node --test test/`).
import { test } from "node:test"
import assert from "node:assert/strict"
import { generatePrivateKey } from "viem/accounts"
import { x402Request, BASE_MAINNET } from "../dist/x402-client.js"

const URL_PING = "https://chain-analyzer.example/x402/api/ping"
const PAY_TO = "0xe8e26183736D796d401Df30810207465fa708959"
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

function paymentRequired(amount, { withBase = true } = {}) {
  const accepts = []
  if (withBase) {
    accepts.push({
      scheme: "exact",
      network: BASE_MAINNET,
      amount,
      asset: USDC_BASE,
      payTo: PAY_TO,
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    })
  }
  accepts.push({
    scheme: "exact",
    network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    amount,
    asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    payTo: "4eXmvApCcE8wiEWRjoDAfN5Jpdi2UFKTJ9irswV9dkX2",
    maxTimeoutSeconds: 60,
    extra: { feePayer: "BENrLoUbndxoNMUS5JXApGMtNykLjFXXixMtpDwDR9SP" },
  })
  return {
    x402Version: 2,
    resource: { type: "http", url: URL_PING, mimeType: "application/json" },
    accepts,
    error: "Payment required.",
  }
}

function resp402(body) {
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(body)).toString("base64"),
    },
  })
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/** Stub fetch: first call -> 402 quote, paid call -> `onPaid(request)`. Records every request. */
function stubFetch(amount, onPaid, opts) {
  const calls = []
  const fn = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    calls.push({ req, body: req.body ? await req.clone().text() : "" })
    if (req.headers.has("PAYMENT-SIGNATURE")) return onPaid(req)
    return resp402(paymentRequired(amount, opts))
  }
  return { fn, calls }
}

function decodePayment(req) {
  return JSON.parse(Buffer.from(req.headers.get("PAYMENT-SIGNATURE"), "base64").toString("utf8"))
}

const env = (extra = {}) => ({ X402_PRIVATE_KEY: generatePrivateKey(), ...extra })

test("GET: 402 -> signed resend with PAYMENT-SIGNATURE -> 200", async () => {
  const { fn, calls } = stubFetch("10000", () => json(200, { ok: true }))
  const data = await x402Request(URL_PING, {}, { fetch: fn, env: env() })
  assert.deepEqual(data, { ok: true })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].req.headers.has("PAYMENT-SIGNATURE"), false)
  const payload = decodePayment(calls[1].req)
  assert.equal(payload.x402Version, 2)
  assert.equal(payload.accepted.network, BASE_MAINNET)
  assert.equal(payload.accepted.payTo, PAY_TO) // payTo comes from the 402 as-is
  assert.equal(payload.accepted.amount, "10000")
  assert.equal(payload.payload.authorization.to.toLowerCase(), PAY_TO.toLowerCase())
  assert.equal(payload.payload.authorization.value, "10000")
})

test("POST: the JSON body is sent on both the first and the paid request", async () => {
  const { fn, calls } = stubFetch("1000000", () => json(200, { results: [] }))
  const body = JSON.stringify({ addresses: ["0x00000000000000000000000000000000000000aa"], chain: "ethereum" })
  await x402Request("https://chain-analyzer.example/x402/api/hack-exposure/batch", { method: "POST", body }, {
    fetch: fn,
    env: env(),
  })
  assert.equal(calls.length, 2)
  for (const c of calls) {
    assert.equal(c.req.method, "POST")
    assert.equal(c.body, body)
  }
})

test("over the per-call limit: refuses before signing and names the price", async () => {
  const { fn, calls } = stubFetch("2500000", () => assert.fail("must not pay"))
  await assert.rejects(x402Request(URL_PING, {}, { fetch: fn, env: env() }), (err) => {
    assert.match(err.message, /\$2\.50/)
    assert.match(err.message, /X402_MAX_USD_PER_CALL/)
    assert.match(err.message, /Nothing was paid/)
    return true
  })
  assert.equal(calls.length, 1)
})

test("raising X402_MAX_USD_PER_CALL allows the $2.50 batch", async () => {
  const { fn, calls } = stubFetch("2500000", () => json(200, { ok: true }))
  await x402Request(URL_PING, {}, { fetch: fn, env: env({ X402_MAX_USD_PER_CALL: "2.50" }) })
  assert.equal(calls.length, 2)
})

test("X402_NETWORK other than base is a clear error and nothing is fetched", async () => {
  const { fn, calls } = stubFetch("10000", () => assert.fail("must not pay"))
  await assert.rejects(x402Request(URL_PING, {}, { fetch: fn, env: env({ X402_NETWORK: "solana" }) }), /Base mainnet only/)
  assert.equal(calls.length, 0)
})

test("no Base option in the 402: nothing is paid", async () => {
  const { fn, calls } = stubFetch("10000", () => assert.fail("must not pay"), { withBase: false })
  await assert.rejects(x402Request(URL_PING, {}, { fetch: fn, env: env() }), /USDC-on-Base/)
  assert.equal(calls.length, 1)
})

test("rejected payment: the server's error, reason and EIP-7702 hint reach the caller", async () => {
  const e = env()
  const { fn } = stubFetch("10000", () =>
    json(402, {
      error: "invalid signature",
      reason: "invalid_exact_evm_payload_signature",
      hint: { code: "payer_has_eip7702_delegation", message: "Pay from a plain EOA." },
      x402Version: 2,
    }),
  )
  await assert.rejects(x402Request(URL_PING, {}, { fetch: fn, env: e }), (err) => {
    assert.match(err.message, /Nothing was charged/)
    assert.match(err.message, /invalid_exact_evm_payload_signature/)
    assert.match(err.message, /payer_has_eip7702_delegation/)
    assert.match(err.message, /EIP-7702 delegation/)
    assert.ok(!err.message.includes(e.X402_PRIVATE_KEY.slice(2)), "key must not leak")
    return true
  })
})

test("paid call failing with 5xx says it was not charged", async () => {
  const { fn } = stubFetch("10000", () => json(502, { success: false, error: "upstream_unavailable" }))
  await assert.rejects(x402Request(URL_PING, {}, { fetch: fn, env: env() }), /not charged[\s\S]*upstream_unavailable/)
})

test("invalid key: error does not echo the value", async () => {
  const bad = "0xnotakey-secretvalue"
  await assert.rejects(x402Request(URL_PING, {}, { fetch: async () => assert.fail(), env: { X402_PRIVATE_KEY: bad } }), (err) => {
    assert.ok(!err.message.includes("secretvalue"))
    return true
  })
})

test("no auth: 402 reports the price from accepts[].amount", async () => {
  const fn = async () => resp402(paymentRequired("10000"))
  await assert.rejects(x402Request(URL_PING, {}, { fetch: fn, env: {} }), (err) => {
    assert.match(err.message, /\$0\.01 USDC on eip155:8453/)
    assert.doesNotMatch(err.message, /unknown/)
    return true
  })
})

test("API key wins over the private key and sends X-API-Key", async () => {
  let seen
  const fn = async (input, init) => {
    seen = new Request(input, init)
    return json(200, { ok: true })
  }
  await x402Request(URL_PING, {}, { fetch: fn, env: env({ CHAINANALYZER_API_KEY: "tfk_test" }) })
  assert.equal(seen.headers.get("X-API-Key"), "tfk_test")
  assert.equal(seen.headers.has("PAYMENT-SIGNATURE"), false)
})
