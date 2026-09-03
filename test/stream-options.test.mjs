import assert from "node:assert/strict";
import test from "node:test";
import { buildCursorAgentOptions } from "../dist/src/config.js";

const base = {
  apiKey: "test-key",
  modelId: "auto",
  cwd: "/tmp/workspace",
};

test("tool turns allow only the SDK MCP family", () => {
  const options = buildCursorAgentOptions(base);

  assert.deepEqual(options.tools, ["mcp"]);
  assert.deepEqual(options.local, { cwd: base.cwd, settingSources: [] });
});

test("chat-only turns disable every built-in SDK tool", () => {
  const options = buildCursorAgentOptions({ ...base, chatOnly: true });

  assert.deepEqual(options.tools, []);
});
