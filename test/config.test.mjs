import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CHAT_MODE_CONFIG,
  resolveChatModeConfig,
} from "../dist/src/config.js";

test("invalid chat configuration falls back to safe defaults", () => {
  assert.deepEqual(
    resolveChatModeConfig({
      chatMode: "sometimes",
      slimSystemMaxChars: -1,
      maxHistoryMessages: 0,
    }),
    DEFAULT_CHAT_MODE_CONFIG,
  );
});

test("valid chat configuration is preserved", () => {
  assert.deepEqual(
    resolveChatModeConfig({
      chatMode: "never",
      slimSystemMaxChars: 4000,
      maxHistoryMessages: 10,
      includeThinkingInPrompt: true,
    }),
    {
      chatMode: "never",
      slimSystemMaxChars: 4000,
      maxHistoryMessages: 10,
      includeThinkingInPrompt: true,
    },
  );
});
