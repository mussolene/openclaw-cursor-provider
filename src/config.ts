export type ChatMode = "auto" | "always" | "never";

export interface ChatModeConfig {
  chatMode: ChatMode;
  slimSystemMaxChars: number;
  maxHistoryMessages: number;
  includeThinkingInPrompt: boolean;
}

export const DEFAULT_CHAT_MODE_CONFIG: ChatModeConfig = {
  chatMode: "auto",
  slimSystemMaxChars: 2000,
  maxHistoryMessages: 6,
  includeThinkingInPrompt: false,
};

export function resolveChatModeConfig(pluginConfig?: Record<string, unknown>): ChatModeConfig {
  const chatMode = pluginConfig?.chatMode;
  const resolvedMode: ChatMode =
    chatMode === "always" || chatMode === "never" || chatMode === "auto"
      ? chatMode
      : DEFAULT_CHAT_MODE_CONFIG.chatMode;

  return {
    chatMode: resolvedMode,
    slimSystemMaxChars:
      typeof pluginConfig?.slimSystemMaxChars === "number" && pluginConfig.slimSystemMaxChars > 0
        ? pluginConfig.slimSystemMaxChars
        : DEFAULT_CHAT_MODE_CONFIG.slimSystemMaxChars,
    maxHistoryMessages:
      typeof pluginConfig?.maxHistoryMessages === "number" && pluginConfig.maxHistoryMessages > 0
        ? pluginConfig.maxHistoryMessages
        : DEFAULT_CHAT_MODE_CONFIG.maxHistoryMessages,
    includeThinkingInPrompt: pluginConfig?.includeThinkingInPrompt === true,
  };
}
