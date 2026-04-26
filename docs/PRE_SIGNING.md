# Pre-Signing Risk Check — 5-Line Integration

> Before any wallet signing flow, call ChainAnalyzer to screen the
> destination address. If the risk score is high, block the signature
> instead of letting your user send funds to a known drainer or sanctioned
> wallet.

This is the integration pattern wallets, signing layers, and autonomous
agents should adopt as a guardrail. Three lines of fetch + a threshold.

---

## TypeScript — recommended path

The 5-line drop-in:

```ts
async function checkDestination(address: string, chain?: string) {
  const url = new URL("https://chain-analyzer.com/api/v1/public/scan")
  url.searchParams.set("address", address)
  if (chain) url.searchParams.set("chain", chain)
  const res = await fetch(url, {
    headers: { "X-API-Key": process.env.CHAINANALYZER_API_KEY! },
  })
  return res.json() as Promise<{
    risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    risk_score: number
    detections: Array<{ id: string; title: string; severity: string }>
    ml_anomaly_score?: number
  }>
}
```

Use it directly in the signing flow:

```ts
const check = await checkDestination(tx.to, "ethereum")

if (check.risk_score >= 70) {
  return alert(
    `Blocked: ${check.risk_level} — ${check.detections[0]?.title ?? "unknown reason"}`,
  )
}

await wallet.sendTransaction(tx)
```

That's the full integration. Three new functions in your codebase: a
fetcher, a threshold check, and a UX hook into your existing signing
modal.

---

## Risk levels and recommended UX

| Score  | Level    | What we recommend the wallet do                  |
| ------ | -------- | ------------------------------------------------ |
| 0 – 9  | LOW      | Proceed silently                                 |
| 10–39  | MEDIUM   | Show an inline warning under the recipient field |
| 40–69  | HIGH     | Confirm dialog with the top detection title      |
| 70–100 | CRITICAL | Block signing entirely. Surface the detection.   |

The thresholds are starting points. You can tune them per-product —
a custodial wallet might block at 40, a power-user wallet at 70.

---

## What you get back

```json
{
  "address": "0xabc…",
  "chain": "ethereum",
  "risk_level": "CRITICAL",
  "risk_score": 95,
  "detection_count": 3,
  "detections": [
    {
      "id": "P1_KNOWN_DRAINER",
      "title": "Known wallet drainer",
      "severity": "CRITICAL",
      "evidence": "Address listed in ScamDB entry #214"
    },
    { "id": "S3_OFAC", "title": "OFAC SDN match", "severity": "CRITICAL" },
    { "id": "M2_ML_ANOMALY", "title": "ML anomaly", "severity": "MEDIUM" }
  ],
  "ml_anomaly_score": 0.87
}
```

The detection IDs (e.g. `P1_KNOWN_DRAINER`, `S3_OFAC`, `M2_ML_ANOMALY`) are
stable — safe to switch on in your UX. The full ID list is at
[/docs/detection](https://chain-analyzer.com/docs/detection).

---

## Auth modes

Three options, pick whichever fits your stack:

### 1. `tfk_` API key (REST)

Fastest to integrate. Get a trial key by emailing **`blue_tabby@mac.com`**
with your project name and intended use; we issue a 100-call /
30-day Integration Trial within 24 hours.

```ts
fetch("https://chain-analyzer.com/api/v1/public/scan?address=…", {
  headers: { "X-API-Key": "tfk_…" },
})
```

### 2. x402 USDC pay-per-request (no key, no signup)

If your stack already has a Coinbase CDP wallet or any EIP-712 / SPL
signing capability, you can call the same scan logic via x402 with
no provisioning at all — pay $0.008 in USDC per call on Base or
Solana mainnet.

```ts
import { wrapFetchWithPayment } from "x402-fetch"
import { privateKeyToAccount } from "viem/accounts"

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY!)
const fetchPaid = wrapFetchWithPayment(fetch, {
  privateKey: account,
  network: "base",
})
const r = await fetchPaid(
  `https://chain-analyzer.com/x402/api/address/${addr}/risk-score`,
)
```

### 3. MCP tool call (Claude / GPT / Gemini / Cursor / Cline / Windsurf)

For autonomous agents, the simplest pattern is to expose ChainAnalyzer
as a tool the model can call before drafting any signed payload.

```bash
npx -y chainanalyzer-mcp
```

Add to `claude_desktop_config.json` (or any MCP client):

```json
{
  "mcpServers": {
    "chainanalyzer": {
      "command": "npx",
      "args": ["-y", "chainanalyzer-mcp"],
      "env": { "CHAINANALYZER_API_KEY": "tfk_…" }
    }
  }
}
```

The model now has six tools, the most important of which is
`check_address_risk`. Wire it into the agent's pre-signing workflow.

---

## Other languages

### Python

```python
import os, requests

def check_destination(address: str, chain: str | None = None) -> dict:
    params = {"address": address}
    if chain:
        params["chain"] = chain
    r = requests.get(
        "https://chain-analyzer.com/api/v1/public/scan",
        headers={"X-API-Key": os.environ["CHAINANALYZER_API_KEY"]},
        params=params,
        timeout=10,
    )
    r.raise_for_status()
    return r.json()
```

### Rust (reqwest)

```rust
use reqwest::Client;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct RiskResult {
    pub risk_level: String,
    pub risk_score: u32,
    pub detections: Vec<serde_json::Value>,
}

pub async fn check_destination(
    client: &Client,
    address: &str,
    api_key: &str,
) -> reqwest::Result<RiskResult> {
    client
        .get("https://chain-analyzer.com/api/v1/public/scan")
        .query(&[("address", address)])
        .header("X-API-Key", api_key)
        .send()
        .await?
        .json()
        .await
}
```

### curl (smoke test)

```bash
curl -H "X-API-Key: tfk_…" \
  "https://chain-analyzer.com/api/v1/public/scan?address=0xabc…&chain=ethereum"
```

---

## Why pre-signing is the right hook

Most wallet-side losses do not come from poor private-key hygiene;
they come from users signing transactions they intended to send to a
*different* address. Address poisoning, phishing-clone storefronts,
clipboard hijack, malicious approval flows — all of them depend on
the user not catching the bad destination at the moment of signing.

A 200-millisecond GET that surfaces "this address is a known drainer"
before the signature dialog appears closes that gap entirely. It is
the highest-leverage place in any signing UX to add a guardrail.

---

## Latency, regions, SLOs

- **Region:** Azure Japan East (production). Optional Cloudflare edge
  caching in front for low-latency reads.
- **Typical p50 latency:** ~150 ms for cached scans, ~600 ms for
  cold scans (full multi-detector pipeline).
- **Cache TTL:** 7 days for the same `(address, chain)` pair.
- **Availability target:** 99.5% during this preview period.

---

## Friction log + 24-hour SLO

We are running a public friction log for testers integrating
ChainAnalyzer. Open an issue at
[`rascal-3/chainanalyzer-mcp`](https://github.com/rascal-3/chainanalyzer-mcp)
with the `[friction]` prefix. Triage SLO is best-effort within 24 hours,
no worse than 48.

---

## Links

- API reference: <https://chain-analyzer.com/docs/api>
- x402 docs: <https://chain-analyzer.com/docs/x402>
- Bazaar manifest: <https://chain-analyzer.com/x402/api/services.json>
- Detection rule list: <https://chain-analyzer.com/docs/detection>
- MCP package: <https://www.npmjs.com/package/chainanalyzer-mcp>
- Glama listing (AAA): <https://glama.ai/mcp/servers/rascal-3/chainanalyzer-mcp>
- Engineering blog: <https://blog.chain-analyzer.com>

— Kenzo Arai · refinancier, inc. · `chainanalyzer.eth`
