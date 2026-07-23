import type { InteractionUpdate } from "@cursor/sdk";
import type { ToolCall, Tool } from "openclaw/plugin-sdk/llm";

export const CURSOR_CUSTOM_TOOLS_PROVIDER = "custom-user-tools";

const CORE_TOOL_IDS: Record<string, string> = {
  read: "openclaw:core:read",
  shell: "openclaw:core:exec",
  grep: "openclaw:core:grep",
  glob: "openclaw:core:glob",
  write: "openclaw:core:write",
  edit: "openclaw:core:edit",
  delete: "openclaw:core:delete",
  ls: "openclaw:core:list_dir",
};

export type ParsedCursorToolIntent =
  | { kind: "openclaw"; toolCall: ToolCall }
  | { kind: "forbidden-builtin"; builtinType: string; callId: string }
  | { kind: "foreign-mcp"; toolName: string; callId: string };

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mcpToolName(toolCall: { args?: unknown }): string | undefined {
  const args = asRecord(toolCall.args);
  const name = args.toolName;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

function mcpToolArgs(toolCall: { args?: unknown }): Record<string, unknown> {
  const args = asRecord(toolCall.args);
  return asRecord(args.args);
}

function mcpProvider(toolCall: { args?: unknown }): string | undefined {
  const args = asRecord(toolCall.args);
  const provider = args.providerIdentifier;
  return typeof provider === "string" ? provider : undefined;
}

const BUILTIN_TO_OPENCLAW: Record<string, string> = {
  read: "read",
  shell: "exec",
  grep: "grep",
  glob: "glob",
  ls: "list_dir",
  write: "write",
  edit: "edit",
  delete: "delete",
};

function normalizeToolCallArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  if (name !== "tool_call") return args;
  const out = { ...args };
  if (typeof out.toolId === "string" && out.id === undefined) out.id = out.toolId;
  if (out.arguments !== undefined && out.args === undefined) out.args = out.arguments;
  return out;
}

function mapBuiltinToOpenClaw(
  builtinType: string,
  toolCall: { args?: unknown },
  allowedNames: Set<string>,
  callId: string,
): ToolCall | undefined {
  const rawArgs = asRecord((toolCall as { args?: unknown }).args);
  const arguments_: Record<string, unknown> = { ...rawArgs };

  if (builtinType === "read" && arguments_.path === undefined && arguments_.file !== undefined) {
    arguments_.path = arguments_.file;
  }
  if (builtinType === "shell" && arguments_.command !== undefined && arguments_.cmd === undefined) {
    arguments_.cmd = arguments_.command;
  }

  const directName = BUILTIN_TO_OPENCLAW[builtinType];
  if (directName && allowedNames.has(directName)) {
    return {
      type: "toolCall",
      id: callId || `cursor-${directName}-${Date.now()}`,
      name: directName,
      arguments: arguments_,
    };
  }

  // Lean catalog: tool_search / tool_call / tool_describe only
  if (allowedNames.has("tool_call")) {
    const coreId = CORE_TOOL_IDS[builtinType];
    if (coreId) {
      return {
        type: "toolCall",
        id: callId || `cursor-tool_call-${Date.now()}`,
        name: "tool_call",
        arguments: normalizeToolCallArgs("tool_call", {
          id: coreId,
          args: arguments_,
        }),
      };
    }
  }

  return undefined;
}

export function openClawToolNames(tools: Tool[] | undefined): Set<string> {
  return new Set((tools ?? []).map((t) => t.name).filter(Boolean));
}

export function isLeanToolCatalog(allowedNames: Set<string>): boolean {
  return allowedNames.has("tool_call") && !allowedNames.has("read");
}

export function parseCursorToolIntent(
  update: InteractionUpdate,
  allowedNames: Set<string>,
): ParsedCursorToolIntent | undefined {
  if (
    update.type !== "tool-call-started" &&
    update.type !== "partial-tool-call" &&
    update.type !== "tool-call-completed"
  ) {
    return undefined;
  }

  const callId = "callId" in update && typeof update.callId === "string" ? update.callId : "";
  const toolCall = "toolCall" in update ? update.toolCall : undefined;
  if (!toolCall || typeof toolCall !== "object" || !("type" in toolCall)) return undefined;

  const builtinType = String((toolCall as { type: string }).type);

  if (builtinType === "mcp") {
    const toolName = mcpToolName(toolCall as { args?: unknown });
    const provider = mcpProvider(toolCall as { args?: unknown });
    if (!toolName) return undefined;

    const isCustomUserTools =
      !provider || provider === CURSOR_CUSTOM_TOOLS_PROVIDER || provider.includes("custom-user-tools");

    if (isCustomUserTools && allowedNames.has(toolName)) {
      return {
        kind: "openclaw",
        toolCall: {
          type: "toolCall",
          id: callId || `cursor-${toolName}-${Date.now()}`,
          name: toolName,
          arguments: normalizeToolCallArgs(toolName, mcpToolArgs(toolCall as { args?: unknown })),
        },
      };
    }

    if (isCustomUserTools) {
      return { kind: "foreign-mcp", toolName, callId };
    }

    return { kind: "foreign-mcp", toolName: `${provider}/${toolName}`, callId };
  }

  const mapped = mapBuiltinToOpenClaw(builtinType, toolCall as { args?: unknown }, allowedNames, callId);
  if (mapped) {
    return { kind: "openclaw", toolCall: mapped };
  }

  return { kind: "forbidden-builtin", builtinType, callId };
}

export function toolParametersToJsonSchema(parameters: Tool["parameters"]): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(parameters ?? { type: "object", properties: {} })) as Record<
      string,
      unknown
    >;
  } catch {
    return { type: "object", properties: {} };
  }
}
