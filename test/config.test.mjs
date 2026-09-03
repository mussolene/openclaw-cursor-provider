import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CHAT_MODE_CONFIG,
  DEFAULT_CURSOR_SDK_RUNTIME_CONFIG,
  resolveChatModeConfig,
  resolveCursorSdkRuntimeConfig,
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

test("invalid SDK runtime configuration falls back to the server-safe default", () => {
  assert.deepEqual(
    resolveCursorSdkRuntimeConfig({ workspaceScanCacheTtlMs: -1 }),
    DEFAULT_CURSOR_SDK_RUNTIME_CONFIG,
  );
});

test("SDK workspace scan cache can be tuned or disabled", () => {
  assert.deepEqual(resolveCursorSdkRuntimeConfig({ workspaceScanCacheTtlMs: 900_000 }), {
    workspaceScanCacheTtlMs: 900_000,
  });
  assert.deepEqual(resolveCursorSdkRuntimeConfig({ workspaceScanCacheTtlMs: 0 }), {
    workspaceScanCacheTtlMs: 0,
  });
});
