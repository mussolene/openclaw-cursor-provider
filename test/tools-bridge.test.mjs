import assert from "node:assert/strict";
import test from "node:test";
import {
  TOOL_INTERCEPT_GRACE_MS,
  buildOpenClawCustomTools,
} from "../dist/src/tools-bridge.js";

const tool = {
  name: "sessions_spawn",
  description: "Start an ACP session",
  parameters: {
    type: "object",
    properties: {
      runtime: { type: "string" },
      mode: { type: "string" },
    },
  },
};

test("custom tool safety result is delayed for orchestrator interception", async () => {
  const tools = buildOpenClawCustomTools([tool], 25);
  const execution = tools.sessions_spawn.execute({}, {});
  const early = await Promise.race([
    execution.then(() => "resolved"),
    new Promise((resolve) => setTimeout(() => resolve("pending"), 5)),
  ]);

  assert.equal(early, "pending");
  const result = await execution;
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /safety timeout/);
});

test("default interception window is longer than the stream drain window", () => {
  assert.ok(TOOL_INTERCEPT_GRACE_MS > 8_000);
});
