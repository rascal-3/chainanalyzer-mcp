/**
 * Agent example: "screen this deposit address before crediting".
 *
 *   OPENAI_API_KEY=... CHAINANALYZER_API_KEY=tfk_... npx tsx src/example.ts 0xSender ethereum
 *   CHAINANALYZER_DRY_RUN=1 X402_PRIVATE_KEY=0x... npx tsx src/example.ts 0xSender   # quotes, pays nothing
 */
import { generateText, stepCountIs } from "ai"
import { openai } from "@ai-sdk/openai"
import { chainAnalyzerTools } from "./tools.js"

const [address, chain] = process.argv.slice(2)
if (!address) {
  console.error("usage: tsx src/example.ts <address> [chain]")
  process.exit(1)
}

const { text } = await generateText({
  model: openai(process.env.LLM_MODEL ?? "gpt-4o-mini"),
  tools: chainAnalyzerTools(),
  stopWhen: stepCountIs(5), // bounds the number of paid tool calls
  system: `You screen incoming crypto deposits before they are credited.
1. Call chainanalyzer_sanctions_check first ($0.50). sanctioned=true -> HOLD, stop.
2. Call chainanalyzer_hack_exposure ($0.50). matched=true -> REVIEW, cite incident, hop and role.
3. Only for large amounts with both checks clean, call chainanalyzer_risk_score ($1.00):
   severity HIGH/CRITICAL -> REVIEW, otherwise CREDIT.
Never repeat a call. Answer: decision (CREDIT / REVIEW / HOLD), one-line reason, tools used,
total USDC cost, and a note that this is not a legal determination.`,
  prompt: `Deposit of 25,000 USDC from ${address}${chain ? ` on ${chain}` : ""}. Credit it?`,
})

console.log(text)
