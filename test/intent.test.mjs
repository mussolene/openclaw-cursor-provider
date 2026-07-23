import assert from "node:assert/strict";
import test from "node:test";
import { hasActiveToolLoop, needsTools } from "../dist/src/intent.js";

function context(text) {
  return {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text }]
      }
    ]
  };
}

const config = {
  chatMode: "auto",
  slimSystemMaxChars: 2000,
  maxHistoryMessages: 6,
  includeThinkingInPrompt: false
};

test("Russian file action enables tool mode", async () => {
  assert.equal(needsTools(context("прочитай SOUL.md одной фразой"), config), true);
  assert.equal(needsTools(context("проверь логи cursor provider"), config), true);
});

test("plain git explanation stays chat-only", async () => {
  assert.equal(needsTools(context("расскажи что такое git"), config), false);
  assert.equal(needsTools(context("git status покажи"), config), true);
});

test("long requests use tool mode", () => {
  assert.equal(needsTools(context("а".repeat(281)), config), true);
});

test("unfinished tool calls keep the harness in tool mode", () => {
  const pending = {
    messages: [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call-1", name: "read", arguments: {} }],
      },
    ],
  };
  assert.equal(hasActiveToolLoop(pending), true);
});
