export const PLUGIN_ID = "openclaw-cursor-provider";
export const PROVIDER_ID = "cursor";
export const API_KEY_ENV = "CURSOR_API_KEY";

export const MODEL_DEFAULTS = {
  input: ["text"] as const,
  contextWindow: 128000,
  maxTokens: 8192,
  /** Match agents.defaults.timeoutSeconds so OpenClaw idle watchdog is not capped at 120s. */
  requestTimeoutMs: 900_000,
  /** Per-million token USD — override via plugins.entries.openclaw-cursor-provider.config.pricing */
  cost: { input: 2.0, output: 8.0, cacheRead: 0.5, cacheWrite: 2.0 },
};

export const STATIC_MODEL_IDS = [
  "auto",
  "composer-2.5",
  "composer-2.5-fast",
  "gpt-5.3-codex",
  "gpt-5.3-codex-low",
  "gpt-5.3-codex-high",
  "gpt-5.4-high",
  "claude-opus-4-8-high",
] as const;
