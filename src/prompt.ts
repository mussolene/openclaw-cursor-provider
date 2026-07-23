import type { Context, ImageContent, Message, TextContent } from "openclaw/plugin-sdk/llm";
import type { ChatModeConfig } from "./config.js";
import { DEFAULT_CHAT_MODE_CONFIG } from "./config.js";
import { extractUserText, needsTools, tailMessages } from "./intent.js";
import { isLeanToolCatalog } from "./tool-events.js";

const OPENCLAW_ORCHESTRATION_GUARD = `[openclaw-orchestration]
You are one turn inside the OpenClaw agent harness. The orchestrator (not you) executes tools.
Rules:
- Use ONLY the OpenClaw tools registered for this turn when you need to act.
- Do NOT invoke built-in Cursor tools (shell, read, write, grep, edit, task, etc.).
- When you need a tool, emit a single tool call and stop; OpenClaw will run it and send the result back.
- Follow the system instructions and skills from OpenClaw exactly.
`;

const OPENCLAW_FOLLOWUP_GUARD = `[openclaw-orchestration]
Continue the OpenClaw harness turn. Use one OpenClaw tool call if needed, then stop. No Cursor built-in tools.
`;

const OPENCLAW_CHAT_GUARD = `[openclaw-chat]
You are in a lightweight Q&A turn. Answer directly in plain language.
Do not call tools unless the user explicitly asks to read, run, or search files.
`;

const OPENCLAW_CHAT_FOLLOWUP_GUARD = `[openclaw-chat] Continue the conversation. No tools unless explicitly requested.`;

const ANTI_LOOP_RULES = `
Anti-loop rules (mandatory):
- Do NOT call get_goal, create_goal, update_goal, or session_status unless the user explicitly asked about goals or session status.
- Do NOT run session bootstrap or tool_search loops for simple tasks.
- If the user asked to read a file: call tool_call with id openclaw:core:read (or read) directly — one hop.
- Prefer the minimum number of tool turns. Answer the user after you have enough data.
`;

const LEAN_TOOL_HINT = `
Lean tool catalog active: use tool_call with { "id": "openclaw:core:<name>", "args": { ... } }.
Example read: { "id": "openclaw:core:read", "args": { "path": "package.json" } }
`;

type SerializeOptions = {
  includeThinking?: boolean;
};

function partText(content: string | Array<TextContent | ImageContent>): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is TextContent => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function serializeMessage(msg: Message, opts: SerializeOptions = {}): string {
  const includeThinking = opts.includeThinking === true;

  if (msg.role === "user") {
    return `[user]\n${partText(msg.content)}`;
  }
  if (msg.role === "assistant") {
    const chunks: string[] = [];
    for (const block of msg.content) {
      if (includeThinking && block.type === "thinking" && block.thinking) {
        chunks.push(`[assistant thinking]\n${block.thinking}`);
      }
      if (block.type === "text" && block.text) {
        chunks.push(`[assistant]\n${block.text}`);
      }
      if (block.type === "toolCall") {
        chunks.push(
          `[assistant tool ${block.name} id=${block.id}]\n${JSON.stringify(block.arguments ?? {}, null, 2)}`,
        );
      }
    }
    return chunks.join("\n\n");
  }
  if (msg.role === "toolResult") {
    const body = partText(msg.content);
    return `[tool ${msg.toolName} id=${msg.toolCallId}${msg.isError ? " error" : ""}]\n${body}`;
  }
  return "";
}

function extractSlimSystem(systemPrompt: string, maxChars: number): string {
  const trimmed = systemPrompt.trim();
  if (!trimmed) return "";

  const sectionPattern =
    /(?:^|\n)(#{1,3}\s+[^\n]*(?:SOUL\.md|USER\.md|IDENTITY\.md)[^\n]*\n[\s\S]*?)(?=\n#{1,3}\s+[^\n]+|$)/gi;
  const sections: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = sectionPattern.exec(trimmed)) !== null) {
    sections.push(match[1].trim());
  }

  if (sections.length) {
    const joined = sections.join("\n\n");
    return joined.length <= maxChars ? joined : `${joined.slice(0, maxChars)}…`;
  }

  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}…`;
}

function orchestrationGuard(lean: boolean): string {
  const parts = [OPENCLAW_ORCHESTRATION_GUARD.trim(), ANTI_LOOP_RULES.trim()];
  if (lean) parts.push(LEAN_TOOL_HINT.trim());
  return parts.join("\n");
}

function followupGuard(lean: boolean): string {
  const parts = [OPENCLAW_FOLLOWUP_GUARD.trim(), ANTI_LOOP_RULES.trim()];
  if (lean) parts.push(LEAN_TOOL_HINT.trim());
  return parts.join("\n");
}

function serializeOptions(config: ChatModeConfig, toolTurn: boolean): SerializeOptions {
  return { includeThinking: toolTurn && config.includeThinkingInPrompt };
}

function appendSerializedMessages(
  parts: string[],
  messages: Message[],
  config: ChatModeConfig,
  toolTurn: boolean,
): void {
  const opts = serializeOptions(config, toolTurn);
  for (const msg of messages) {
    const block = serializeMessage(msg, opts);
    if (block) parts.push(block);
  }
}

/** Slim prompt for chat-only turns — no tool catalog, truncated system. */
export function buildSlimCursorPrompt(context: Context, config: ChatModeConfig = DEFAULT_CHAT_MODE_CONFIG): string {
  const parts: string[] = [OPENCLAW_CHAT_GUARD.trim()];
  const history = tailMessages(context.messages ?? [], config.maxHistoryMessages);

  if (context.systemPrompt?.trim()) {
    parts.push(`[system]\n${extractSlimSystem(context.systemPrompt, config.slimSystemMaxChars)}`);
  }

  appendSerializedMessages(parts, history, config, false);
  return parts.join("\n\n").trim() || extractUserText(context) || "Continue.";
}

/** Slim follow-up — last user turn only. */
export function buildSlimFollowUpPrompt(
  context: Context,
  config: ChatModeConfig = DEFAULT_CHAT_MODE_CONFIG,
): string {
  const messages = context.messages ?? [];
  const reversed = [...messages].reverse();
  const chunks: string[] = [];

  for (const msg of reversed) {
    if (msg.role === "user") {
      chunks.unshift(`[user]\n${partText(msg.content)}`);
      break;
    }
    if (activeToolResultOnly(msg)) {
      const body = partText(msg.content);
      chunks.unshift(
        `[tool ${msg.toolName} id=${msg.toolCallId}${msg.isError ? " error" : ""}]\n${body}`,
      );
      continue;
    }
    if (msg.role === "assistant") {
      break;
    }
  }

  if (!chunks.length) return buildSlimCursorPrompt(context, config);
  return `${OPENCLAW_CHAT_FOLLOWUP_GUARD}\n\n${chunks.join("\n\n")}`.trim();
}

function activeToolResultOnly(msg: Message): msg is Extract<Message, { role: "toolResult" }> {
  return msg.role === "toolResult";
}

/** Full OpenClaw context — tool turns and bootstrap. */
export function buildCursorPrompt(
  context: Context,
  config: ChatModeConfig = DEFAULT_CHAT_MODE_CONFIG,
): string {
  if (!needsTools(context, config)) {
    return buildSlimCursorPrompt(context, config);
  }

  const lean = isLeanToolCatalog(new Set((context.tools ?? []).map((t) => t.name)));
  const parts: string[] = [orchestrationGuard(lean)];
  const opts = serializeOptions(config, true);

  if (context.systemPrompt?.trim()) {
    parts.push(`[system]\n${context.systemPrompt.trim()}`);
  }

  if (context.tools?.length) {
    const toolLines = context.tools.map((t) => `- ${t.name}: ${t.description || "(no description)"}`);
    parts.push(`[openclaw-tools]\n${toolLines.join("\n")}`);
  }

  for (const msg of context.messages ?? []) {
    const block = serializeMessage(msg, opts);
    if (block) parts.push(block);
  }

  return parts.join("\n\n").trim() || "Continue.";
}

/** Incremental tool turn — no 34KB system replay. */
export function buildCursorFollowUpPrompt(
  context: Context,
  config: ChatModeConfig = DEFAULT_CHAT_MODE_CONFIG,
): string {
  if (!needsTools(context, config)) {
    return buildSlimFollowUpPrompt(context, config);
  }

  const lean = isLeanToolCatalog(new Set((context.tools ?? []).map((t) => t.name)));
  const messages = context.messages ?? [];
  const reversed = [...messages].reverse();
  const chunks: string[] = [];

  for (const msg of reversed) {
    if (msg.role === "user") {
      chunks.unshift(`[user]\n${partText(msg.content)}`);
      break;
    }
    if (msg.role === "toolResult") {
      const body = partText(msg.content);
      chunks.unshift(
        `[tool ${msg.toolName} id=${msg.toolCallId}${msg.isError ? " error" : ""}]\n${body}`,
      );
      continue;
    }
    if (msg.role === "assistant") {
      break;
    }
  }

  if (!chunks.length) return buildCursorPrompt(context, config);
  return `${followupGuard(lean)}\n\n${chunks.join("\n\n")}`.trim();
}

export function shouldSendFullPrompt(params: {
  context: Context;
  sessionBootstrapped: boolean;
  config?: ChatModeConfig;
}): boolean {
  const config = params.config ?? DEFAULT_CHAT_MODE_CONFIG;
  const toolTurn = needsTools(params.context, config);

  if (!toolTurn) return false;

  if (!params.sessionBootstrapped) return true;
  const messages = params.context.messages ?? [];
  if (messages.length <= 1) return true;
  return false;
}
