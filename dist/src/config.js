export const DEFAULT_CHAT_MODE_CONFIG = {
    chatMode: "auto",
    slimSystemMaxChars: 2000,
    maxHistoryMessages: 6,
    includeThinkingInPrompt: false,
};
export const DEFAULT_CURSOR_SDK_RUNTIME_CONFIG = {
    workspaceScanCacheTtlMs: 300_000,
};
export function resolveChatModeConfig(pluginConfig) {
    const chatMode = pluginConfig?.chatMode;
    const resolvedMode = chatMode === "always" || chatMode === "never" || chatMode === "auto"
        ? chatMode
        : DEFAULT_CHAT_MODE_CONFIG.chatMode;
    return {
        chatMode: resolvedMode,
        slimSystemMaxChars: typeof pluginConfig?.slimSystemMaxChars === "number" && pluginConfig.slimSystemMaxChars > 0
            ? pluginConfig.slimSystemMaxChars
            : DEFAULT_CHAT_MODE_CONFIG.slimSystemMaxChars,
        maxHistoryMessages: typeof pluginConfig?.maxHistoryMessages === "number" && pluginConfig.maxHistoryMessages > 0
            ? pluginConfig.maxHistoryMessages
            : DEFAULT_CHAT_MODE_CONFIG.maxHistoryMessages,
        includeThinkingInPrompt: pluginConfig?.includeThinkingInPrompt === true,
    };
}
export function resolveCursorSdkRuntimeConfig(pluginConfig) {
    const workspaceScanCacheTtlMs = pluginConfig?.workspaceScanCacheTtlMs;
    return {
        workspaceScanCacheTtlMs: typeof workspaceScanCacheTtlMs === "number" &&
            Number.isFinite(workspaceScanCacheTtlMs) &&
            workspaceScanCacheTtlMs >= 0
            ? workspaceScanCacheTtlMs
            : DEFAULT_CURSOR_SDK_RUNTIME_CONFIG.workspaceScanCacheTtlMs,
    };
}
export function buildCursorAgentOptions(params) {
    return {
        apiKey: params.apiKey,
        model: { id: params.modelId },
        // Tool turns expose only OpenClaw custom tools through the SDK MCP family.
        // Chat turns receive no built-in tools at all.
        tools: params.chatOnly ? [] : ["mcp"],
        local: { cwd: params.cwd, settingSources: [] },
    };
}
