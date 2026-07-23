import assert from "node:assert/strict";
import test from "node:test";
import {
  CURSOR_CUSTOM_TOOLS_PROVIDER,
  parseCursorToolIntent,
} from "../dist/src/tool-events.js";

test("Cursor shell calls map to an OpenClaw exec tool", () => {
  const result = parseCursorToolIntent(
    {
      type: "tool-call-started",
      callId: "call-shell",
      toolCall: { type: "shell", args: { command: "pwd" } },
    },
    new Set(["exec"]),
  );

  assert.deepEqual(result, {
    kind: "openclaw",
    toolCall: {
      type: "toolCall",
      id: "call-shell",
      name: "exec",
      arguments: { command: "pwd", cmd: "pwd" },
    },
  });
});

test("custom Cursor MCP calls map only to allowed OpenClaw tools", () => {
  const update = {
    type: "tool-call-started",
    callId: "call-read",
    toolCall: {
      type: "mcp",
      args: {
        providerIdentifier: CURSOR_CUSTOM_TOOLS_PROVIDER,
        toolName: "read",
        args: { path: "README.md" },
      },
    },
  };

  assert.equal(parseCursorToolIntent(update, new Set(["exec"]))?.kind, "foreign-mcp");
  assert.equal(parseCursorToolIntent(update, new Set(["read"]))?.kind, "openclaw");
});

test("unknown built-in tools fail closed", () => {
  const result = parseCursorToolIntent(
    {
      type: "tool-call-started",
      callId: "call-task",
      toolCall: { type: "task", args: {} },
    },
    new Set(["read"]),
  );

  assert.deepEqual(result, {
    kind: "forbidden-builtin",
    builtinType: "task",
    callId: "call-task",
  });
});
