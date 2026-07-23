import type { Context, ImageContent, Message, TextContent } from "openclaw/plugin-sdk/llm";
import type { ChatModeConfig } from "./config.js";

const ACTION_PATTERN =
  /(^|[^\p{L}\p{N}_])(?:прочитай|покажи|найди|запусти|проверь|логи?|файлы?|открой|выполни|grep|exec|read|show|find|run|check|search|cat|ls|git\s+status|git\s+log)(?=$|[^\p{L}\p{N}_])/iu;

const LONG_TASK_CHARS = 280;

function partText(content: string | Array<TextContent | ImageContent>): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is TextContent => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

export function extractUserText(context: Context): string {
  const messages = context.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      return partText(msg.content).trim();
    }
  }
  return "";
}

export function hasActiveToolLoop(context: Context): boolean {
  const messages = context.messages ?? [];
  if (!messages.length) return false;

  const last = messages[messages.length - 1];
  if (last.role === "toolResult") return true;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "toolResult") return true;
    if (msg.role === "assistant") {
      const hasToolCall = msg.content.some((block) => block.type === "toolCall");
      if (!hasToolCall) return false;
      const after = messages.slice(i + 1);
      return !after.some((m) => m.role === "toolResult");
    }
    if (msg.role === "user") return false;
  }

  return false;
}

export function needsTools(context: Context, config: ChatModeConfig): boolean {
  if (config.chatMode === "never") return true;
  if (config.chatMode === "always") return false;

  if (hasActiveToolLoop(context)) return true;

  const userText = extractUserText(context);
  if (!userText) return false;
  if (userText.length > LONG_TASK_CHARS) return true;
  if (ACTION_PATTERN.test(userText)) return true;

  return false;
}

export function isChatOnlyTurn(context: Context, config: ChatModeConfig): boolean {
  return !needsTools(context, config);
}

export function tailMessages(messages: Message[], maxMessages: number): Message[] {
  if (messages.length <= maxMessages) return messages;
  return messages.slice(-maxMessages);
}
