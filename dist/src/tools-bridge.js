import { toolParametersToJsonSchema } from "./tool-events.js";
export const TOOL_INTERCEPT_GRACE_MS = 15_000;
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * OpenClaw owns tool execution. Custom tools exist only so Cursor exposes the
 * same schemas to the model. Cursor invokes execute() concurrently with its
 * tool-call events, so keep the callback pending long enough for OpenClaw to
 * intercept the event and cancel the Cursor run. Returning an immediate error
 * lets Cursor continue the same turn and issue duplicate fallback calls.
 */
export function buildOpenClawCustomTools(tools, interceptGraceMs = TOOL_INTERCEPT_GRACE_MS) {
    const out = {};
    for (const tool of tools ?? []) {
        if (!tool.name?.trim())
            continue;
        const name = tool.name.trim();
        out[name] = {
            description: tool.description || `OpenClaw tool: ${name}`,
            inputSchema: toolParametersToJsonSchema(tool.parameters),
            execute: async (_args, _ctx) => {
                await wait(Math.max(0, interceptGraceMs));
                return {
                    content: [
                        {
                            type: "text",
                            text: "Tool execution is owned by the OpenClaw orchestrator. Interception did not complete before the safety timeout.",
                        },
                    ],
                    isError: true,
                };
            },
        };
    }
    return out;
}
