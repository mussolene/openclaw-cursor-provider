import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Agent } from "@cursor/sdk";

const apiKey = process.env.CURSOR_API_KEY?.trim();
assert(apiKey, "CURSOR_API_KEY is required");

const idleMs = Number(process.env.CURSOR_IDLE_SMOKE_MS ?? 70 * 60 * 1000);
assert(Number.isFinite(idleMs) && idleMs >= 0, "CURSOR_IDLE_SMOKE_MS must be a non-negative number");

const modelId = process.env.CURSOR_IDLE_SMOKE_MODEL?.trim() || "auto";
const agent = await Agent.create({
  apiKey,
  model: { id: modelId },
  tools: [],
  local: { cwd: process.cwd(), settingSources: [] },
});

async function probe(label) {
  const run = await agent.send(`Reply with ${label} only. Do not use tools.`);
  const result = await run.wait();
  assert.equal(result.status, "finished", `${label} finished with status ${result.status}`);
  assert.match(result.result ?? "", new RegExp(label), `${label} was not present in the response`);
}

try {
  await probe("IDLE_SMOKE_BEFORE");
  console.log(`First probe passed; waiting ${idleMs} ms in the same Node process.`);
  await delay(idleMs);
  await probe("IDLE_SMOKE_AFTER");
  let usage;
  let usageError;
  try {
    usage = await agent.getUsage();
  } catch (error) {
    usageError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  console.log(
    JSON.stringify({
      ok: true,
      idleMs,
      totalTokens: usage?.usage.totalTokens ?? null,
      chargedCents: usage?.cost?.chargedCents ?? null,
      usageError: usageError ?? null,
    }),
  );
} finally {
  await agent.close();
}
