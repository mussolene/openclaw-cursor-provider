import assert from "node:assert/strict";
import test from "node:test";
import { buildCursorPrompt, buildCursorFollowUpPrompt } from "../dist/src/prompt.js";

const config = {
  chatMode: "never",
  slimSystemMaxChars: 2000,
  maxHistoryMessages: 6,
  includeThinkingInPrompt: false,
};

test("tool prompt carries ACP direct-chat recovery rules", () => {
  const prompt = buildCursorPrompt(
    {
      systemPrompt: "Use OpenClaw tools.",
      tools: [{ name: "tool_call", description: "Dispatch a tool." }],
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Запусти Cursor через ACP и проверь проект." }],
        },
      ],
    },
    config,
  );

  assert.match(prompt, /use mode="run" in direct chats/i);
  assert.match(prompt, /returns thread_required, retry exactly once/i);
  assert.match(prompt, /acpx --cwd <dir> --format quiet cursor exec/i);
});

test("full and incremental prompts use OpenClaw discovery and push-based ACP completion", () => {
  const context = {
    tools: [{ name: "tool_call", description: "Dispatch a tool." }],
    messages: [{ role: "toolResult", toolName: "tool_call", toolCallId: "spawn-1",
      content: [{ type: "text", text: '{"status":"accepted","mode":"run","expectsCompletionMessage":true}' }] }],
  };
  for (const build of [buildCursorPrompt, buildCursorFollowUpPrompt]) {
    const prompt = build(context, config);
    assert.match(prompt, /never invent Cursor IDE meta-tools such as GetDynamicTools/);
    assert.match(prompt, /completion is pushed back automatically/);
    assert.match(prompt, /Do NOT call sessions_yield, sessions_send/);
    assert.match(prompt, /do not retry the skipped wait/);
  }
});
