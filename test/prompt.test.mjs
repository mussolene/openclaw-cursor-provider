import assert from "node:assert/strict";
import test from "node:test";
import { buildCursorPrompt } from "../dist/src/prompt.js";

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
