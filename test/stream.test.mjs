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
    async resume() { globalThis.__cursorStreamTestResumeCount = (globalThis.__cursorStreamTestResumeCount || 0) + 1; if (globalThis.__cursorStreamTestResumeFails) throw new Error("expired"); return globalThis.__cursorStreamTestAgent; }
  };
`);
const usage = dataModule((await readFile(new URL("../dist/src/usage.js", import.meta.url), "utf8")).replace('"openclaw/plugin-sdk/llm"', JSON.stringify(llm)));
const sessionStore = dataModule(`
  export async function getCursorSession() { return globalThis.__cursorStreamTestSession; }
  export async function deleteCursorSession() {}
  export async function upsertCursorSession(record) { globalThis.__cursorStreamTestWrittenSession = record; }
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

test("tool handoffs rebuild canonical context without resuming the interrupted SDK run", async () => {
  let prompt;
  globalThis.__cursorStreamTestAgent = {
    agentId: "fresh-agent",
    async send(value) {
      prompt = value;
      return { async *stream() {}, async wait() { return {status:"completed",result:"TOOL_OK"}; }, supports() {return false;} };
    },
  };
  try {
    const streamFn = createCursorSdkStreamFn({resolveApiKey:()=>"test-key",resolveWorkspaceDir:()=>"/tmp"});
    for (const pending of [undefined,true]) {
      globalThis.__cursorStreamTestResumeCount = 0;
      globalThis.__cursorStreamTestSession = {agentId:"interrupted-agent",bootstrapped:true,toolHandoffPending:pending};
      const messages = [{role:"user",content:"run exec once"},
        {role:"assistant",content:[{type:"toolCall",id:"call-1",name:"exec",arguments:{command:"printf TOOL_OK"}}]},
        {role:"toolResult",toolName:"exec",toolCallId:"call-1",content:[{type:"text",text:"TOOL_OK"}],isError:false}];
      const result = await streamFn({id:"auto",api:"test",provider:"cursor",cost:{}},
        {systemPrompt:"Required instruction: never repeat a successful command",messages},
        {sessionId:"handoff-session"}).result;
      assert.equal(result.stopReason,"stop");
      assert.equal(globalThis.__cursorStreamTestResumeCount,0);
      assert.match(prompt,/Required instruction/);
      assert.match(prompt,/run exec once/);
      assert.match(prompt,/\[tool exec id=call-1\]\nTOOL_OK/);
      assert.equal(globalThis.__cursorStreamTestWrittenSession.toolHandoffPending,false);
    }
    globalThis.__cursorStreamTestResumeCount = 0;
    globalThis.__cursorStreamTestSession = {agentId:"interrupted-agent",bootstrapped:true,toolHandoffPending:true};
    await streamFn({id:"auto",api:"test",provider:"cursor",cost:{}},
      {systemPrompt:"Required instruction",messages:[{role:"user",content:"run a different command"}]},
      {sessionId:"handoff-session"}).result;
    assert.equal(globalThis.__cursorStreamTestResumeCount,0);
  } finally {
    delete globalThis.__cursorStreamTestAgent;
    delete globalThis.__cursorStreamTestSession;
    delete globalThis.__cursorStreamTestResumeCount;
    delete globalThis.__cursorStreamTestWrittenSession;
  }
});

test("subagent completions use canonical context while ordinary follow-ups still resume", async () => {
  let prompt;
  globalThis.__cursorStreamTestAgent = {
    agentId: "completion-agent",
    async send(value) {
      prompt = value;
      return { async *stream() {}, async wait() { return {status:"completed",result:"ACP_OK"}; }, supports() {return false;} };
    },
  };
  const completion = "<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\n[Internal task completion event]\nsource: subagent\nChild result: ACP_OK\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>";
  try {
    const streamFn = createCursorSdkStreamFn({resolveApiKey:()=>"test-key",resolveWorkspaceDir:()=>"/tmp"});
    for (const content of [completion,[{type:"text",text:completion}]]) {
      globalThis.__cursorStreamTestResumeCount = 0;
      globalThis.__cursorStreamTestSession = {agentId:"completed-parent",bootstrapped:true,toolHandoffPending:false};
      const result = await streamFn({id:"auto",api:"test",provider:"cursor",cost:{}},
        {systemPrompt:"Review child result",messages:[{role:"user",content:"run ACP"},
          {role:"assistant",content:[{type:"text",text:"ACP accepted"}]},{role:"user",content}]},
        {sessionId:"completion-session"}).result;
      assert.equal(result.stopReason,"stop");
      assert.equal(globalThis.__cursorStreamTestResumeCount,0);
      assert.match(prompt,/Review child result/);
      assert.match(prompt,/run ACP/);
      assert.match(prompt,/ACP accepted/);
      assert.match(prompt,/Child result: ACP_OK/);
    }
    globalThis.__cursorStreamTestResumeCount = 0;
    await streamFn({id:"auto",api:"test",provider:"cursor",cost:{}},
      {messages:[{role:"user",content:"read another file"}]},{sessionId:"completion-session"}).result;
    assert.equal(globalThis.__cursorStreamTestResumeCount,1);
  } finally {
    delete globalThis.__cursorStreamTestAgent;
    delete globalThis.__cursorStreamTestSession;
    delete globalThis.__cursorStreamTestResumeCount;
    delete globalThis.__cursorStreamTestWrittenSession;
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
    delete globalThis.__cursorStreamTestResumeCount;
    delete globalThis.__cursorStreamTestWrittenSession;
  }
});

test("a cancelled SDK tool handoff is recorded as non-resumable", async () => {
  let cancelled = 0;
  globalThis.__cursorStreamTestAgent = {
    agentId:"handoff-agent",
    async send(_prompt,options) {
      options.onStep({step:{type:"toolCall",callId:"sdk-call-1",message:{type:"mcp",
        args:{providerIdentifier:"custom-user-tools",toolName:"exec",args:{command:"printf TOOL_OK"}}}}});
      return {async *stream(){},async cancel(){cancelled++;},supports(){return false;}};
    },
  };
  try {
    const streamFn=createCursorSdkStreamFn({resolveApiKey:()=>"test-key",resolveWorkspaceDir:()=>"/tmp"});
    const result=await streamFn({id:"auto",api:"test",provider:"cursor",cost:{}},
      {messages:[{role:"user",content:"run exec once"}],tools:[{name:"exec",description:"Execute a command",
        parameters:{type:"object",properties:{command:{type:"string"}}}}]},
      {sessionId:"test-handoff"}).result;
    assert.equal(result.stopReason,"toolUse");
    assert.equal(cancelled,1);
    assert.equal(globalThis.__cursorStreamTestWrittenSession.toolHandoffPending,true);
    assert.equal(result.content.find(part=>part.type==="toolCall").name,"exec");
  } finally {
    delete globalThis.__cursorStreamTestAgent;
    delete globalThis.__cursorStreamTestWrittenSession;
  }
});
