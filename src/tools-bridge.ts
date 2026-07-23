import type { SDKCustomTool, SDKCustomToolContext, SDKJsonValue } from "@cursor/sdk";
import type { Tool } from "openclaw/plugin-sdk/llm";
import { toolParametersToJsonSchema } from "./tool-events.js";

/**
 * OpenClaw owns tool execution. Custom tools exist only so Cursor exposes the
 * same schemas to the model; execute() is a safety net if cancellation races.
 */
export function buildOpenClawCustomTools(tools: Tool[] | undefined): Record<string, SDKCustomTool> {
  const out: Record<string, SDKCustomTool> = {};
  for (const tool of tools ?? []) {
    if (!tool.name?.trim()) continue;
    const name = tool.name.trim();
    out[name] = {
      description: tool.description || `OpenClaw tool: ${name}`,
      inputSchema: toolParametersToJsonSchema(tool.parameters) as Record<string, SDKJsonValue>,
      execute: (_args: Record<string, SDKJsonValue>, _ctx: SDKCustomToolContext) => ({
        content: [
          {
            type: "text",
            text:
              "Tool execution is owned by the OpenClaw orchestrator. This call should have been intercepted before execution.",
          },
        ],
        isError: true,
      }),
    };
  }
  return out;
}
