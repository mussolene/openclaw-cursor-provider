import type { ConversationTurn } from "@cursor/sdk";

const INTERNAL_TOOL_TYPES = new Set([
  "shell",
  "read",
  "write",
  "edit",
  "delete",
  "grep",
  "glob",
  "ls",
  "semSearch",
  "task",
  "mcp",
]);

/** Detect Cursor-native tool execution that bypassed OpenClaw harness. */
export function conversationHadInternalTools(turns: ConversationTurn[]): boolean {
  for (const turn of turns) {
    const steps = (turn as { steps?: unknown[] }).steps;
    if (!Array.isArray(steps)) continue;
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      const type = (step as { type?: string }).type;
      if (type === "toolCall") {
        const message = (step as { message?: { type?: string } }).message;
        const toolType = message?.type;
        if (toolType && INTERNAL_TOOL_TYPES.has(toolType)) return true;
      }
    }
  }
  return false;
}
