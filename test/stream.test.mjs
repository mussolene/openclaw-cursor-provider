import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const dataModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const llm = dataModule(`
  export function calculateCost() {}
  export function createAssistantMessageEventStream() {
    const events = [];
    let finish;
    const result = new Promise(resolve => { finish = resolve; });
    return { events, result, push(event) { events.push(event); }, end(message) { finish(message); } };
  }
`);
const sdk = dataModule(`
  export class CursorAgentError extends Error {}
  export const Agent = {
    async create() { return globalThis.__cursorStreamTestAgent; },
    async resume() { if (globalThis.__cursorStreamTestResumeFails) throw new Error("expired"); return globalThis.__cursorStreamTestAgent; }
  };
`);
const usage = dataModule((await readFile(new URL("../dist/src/usage.js", import.meta.url), "utf8")).replace('"openclaw/plugin-sdk/llm"', JSON.stringify(llm)));
const sessionStore = dataModule(`
  export async function getCursorSession() { return globalThis.__cursorStreamTestSession; }
  export async function deleteCursorSession() {}
  export async function upsertCursorSession() {}
`);
let source = await readFile(new URL("../dist/src/stream.js", import.meta.url), "utf8");
source = source.replace('"@cursor/sdk"', JSON.stringify(sdk))
  .replace('"openclaw/plugin-sdk/llm"', JSON.stringify(llm))
  .replace(/import \{ ensureCursorSdkBootstrapped \} from "\.\/bootstrap.js";/, "const ensureCursorSdkBootstrapped = () => {};")
  .replace('"./usage.js"', JSON.stringify(usage))
  .replace('"./session-store.js"', JSON.stringify(sessionStore))
  .replace(/from "(\.\/[^"\n]+)"/g, (_, path) => `from ${JSON.stringify(new URL(`../dist/src/${path.slice(2)}`, import.meta.url).href)}`);
const { createCursorSdkStreamFn } = await import(dataModule(source));

// Use the compiled stream with transport boundaries replaced, without credentials.
test("SDK result without deltas emits its text exactly once", async () => {
  globalThis.__cursorStreamTestAgent = {
    agentId: "test-agent",
    async send() {
      return {
        async *stream() {},
        async wait() { return { status: "completed", result: "hello" }; },
        supports() { return false; },
      };
    },
  };
  try {
    const streamFn = createCursorSdkStreamFn({ resolveApiKey: () => "test-key", resolveWorkspaceDir: () => "/tmp" });
    const stream = streamFn({ id: "auto", api: "test", provider: "cursor", cost: {} }, { messages: [{ role: "user", content: "hello" }] });
    const result = await stream.result;
    assert.equal(result.stopReason, "stop");
    assert.deepEqual(result.content, [{ type: "text", text: "hello" }]);
    assert.equal(stream.events.filter(event => event.type === "text_delta").map(event => event.delta).join(""), "hello");
  } finally {
    delete globalThis.__cursorStreamTestAgent;
  }
});

test("failed resume sends full system and history to the new agent", async () => {
  let prompt;
  globalThis.__cursorStreamTestSession = { agentId: "expired", bootstrapped: true };
  globalThis.__cursorStreamTestResumeFails = true;
  globalThis.__cursorStreamTestAgent = {
    agentId: "new-agent",
    async send(value) {
      prompt = value;
      return { async *stream() {}, async wait() { return { status: "completed", result: "done" }; }, supports() { return false; } };
    },
  };
  try {
    const streamFn = createCursorSdkStreamFn({ resolveApiKey: () => "test-key", resolveWorkspaceDir: () => "/tmp", chatModeConfig: { chatMode: "never", includeThinkingInPrompt: false } });
    await streamFn({ id: "auto", api: "test", provider: "cursor", cost: {} }, {
      systemPrompt: "required system instruction",
      messages: [{ role: "user", content: "previous request" }, { role: "assistant", content: [{ type: "text", text: "previous answer" }] }, { role: "user", content: "read file" }],
    }, { sessionId: "test-session" }).result;
    assert.match(prompt, /required system instruction/);
    assert.match(prompt, /previous request/);
    assert.match(prompt, /read file/);
  } finally {
    delete globalThis.__cursorStreamTestAgent;
    delete globalThis.__cursorStreamTestSession;
    delete globalThis.__cursorStreamTestResumeFails;
  }
});
