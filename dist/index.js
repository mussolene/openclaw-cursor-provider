import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createProviderApiKeyAuthMethod } from "openclaw/plugin-sdk/provider-auth";
import { buildProviderReplayFamilyHooks } from "openclaw/plugin-sdk/provider-model-shared";
import { homedir } from "node:os";
import { join } from "node:path";
import { ensureCursorSdkBootstrapped } from "./src/bootstrap.js";
import { resolveChatModeConfig, resolveCursorSdkRuntimeConfig } from "./src/config.js";
import { API_KEY_ENV, MODEL_DEFAULTS, PLUGIN_ID, PROVIDER_ID } from "./src/constants.js";
import { buildProviderConfig, discoverCursorModels, resolvePricingFromConfig, staticModelRows, toOpenClawModels, } from "./src/models.js";
import { resolveModelPricing } from "./src/pricing.js";
import { createCursorSdkStreamFn } from "./src/stream.js";
const REPLAY_HOOKS = buildProviderReplayFamilyHooks({ family: "openai-compatible" });
function resolveWorkspace(api) {
    const fromPlugin = typeof api.pluginConfig?.workspaceDir === "string" ? api.pluginConfig.workspaceDir.trim() : "";
    if (fromPlugin)
        return fromPlugin;
    const fromAgents = api.config?.agents?.defaults?.workspace;
    if (typeof fromAgents === "string" && fromAgents.trim())
        return fromAgents.trim();
    return join(homedir(), ".openclaw", "workspace");
}
function resolveStrictToolLoop(pluginConfig) {
    if (pluginConfig?.strictToolLoop === false)
        return false;
    return true;
}
export default definePluginEntry({
    id: PLUGIN_ID,
    name: "OpenClaw Cursor Provider",
    description: "Cursor via @cursor/sdk — OpenClaw-native provider (tool loop, sessions, billing, full system prompt).",
    register(api) {
        const workspaceDir = resolveWorkspace(api);
        const pluginConfig = api.pluginConfig;
        const pricing = resolvePricingFromConfig(pluginConfig);
        const strictToolLoop = resolveStrictToolLoop(pluginConfig);
        const chatModeConfig = resolveChatModeConfig(pluginConfig);
        const sdkRuntimeConfig = resolveCursorSdkRuntimeConfig(pluginConfig);
        ensureCursorSdkBootstrapped(sdkRuntimeConfig);
        const applyModelPricing = (model) => ({
            ...model,
            cost: resolveModelPricing(model, pricing),
        });
        api.registerProvider({
            id: PROVIDER_ID,
            label: "Cursor",
            docsPath: "/providers/cursor",
            envVars: [API_KEY_ENV],
            auth: [
                createProviderApiKeyAuthMethod({
                    providerId: PROVIDER_ID,
                    methodId: "api-key",
                    label: "Cursor API key",
                    hint: "From Cursor dashboard → Integrations, or ~/.openclaw/.env as CURSOR_API_KEY",
                    optionKey: "cursorApiKey",
                    flagName: "--cursor-api-key",
                    envVar: API_KEY_ENV,
                    promptMessage: "Enter your Cursor API key",
                    defaultModel: `${PROVIDER_ID}/auto`,
                }),
            ],
            catalog: {
                order: "simple",
                run: async (ctx) => {
                    const apiKey = ctx.resolveProviderApiKey(PROVIDER_ID).apiKey ?? process.env[API_KEY_ENV]?.trim();
                    if (!apiKey)
                        return null;
                    const models = await discoverCursorModels(apiKey, pricing);
                    return { provider: buildProviderConfig(apiKey, models, pricing) };
                },
            },
            staticCatalog: {
                order: "simple",
                run: async () => ({
                    provider: {
                        baseUrl: "https://cursor-provider.local/v1",
                        api: "openai-completions",
                        models: toOpenClawModels(staticModelRows(), pricing),
                    },
                }),
            },
            resolveDynamicModel: (ctx) => ({
                id: ctx.modelId,
                name: ctx.modelId,
                provider: PROVIDER_ID,
                api: "openai-completions",
                baseUrl: "https://cursor-provider.local/v1",
                reasoning: /thinking|codex|opus/i.test(ctx.modelId),
                input: [...MODEL_DEFAULTS.input],
                cost: resolveModelPricing({ cost: { ...MODEL_DEFAULTS.cost, ...pricing } }, pricing),
                contextWindow: MODEL_DEFAULTS.contextWindow,
                maxTokens: MODEL_DEFAULTS.maxTokens,
                requestTimeoutMs: MODEL_DEFAULTS.requestTimeoutMs,
            }),
            createStreamFn: () => createCursorSdkStreamFn({
                resolveApiKey: (options) => {
                    const fromOpts = options?.apiKey?.trim();
                    if (fromOpts)
                        return fromOpts;
                    return process.env[API_KEY_ENV]?.trim();
                },
                resolveWorkspaceDir: () => workspaceDir,
                strictToolLoop,
                applyModelPricing,
                chatModeConfig,
                logDebug: (message, meta) => {
                    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
                    api.logger.info(`[cursor-provider] ${message}${suffix}`);
                },
            }),
            ...REPLAY_HOOKS,
            buildMissingAuthMessage: () => `Cursor API key missing. Set ${API_KEY_ENV} in ~/.openclaw/.env or run: openclaw onboard --cursor-api-key <key>`,
        });
        api.logger.info(`OpenClaw Cursor provider registered (workspace=${workspaceDir}, strictToolLoop=${strictToolLoop}, chatMode=${chatModeConfig.chatMode}, workspaceScanCacheTtlMs=${sdkRuntimeConfig.workspaceScanCacheTtlMs}, pricing input=${pricing.input}/1M)`);
    },
});
