import { MODEL_DEFAULTS, PROVIDER_ID, STATIC_MODEL_IDS } from "./constants.js";
import { DEFAULT_PRICING_PER_MILLION, type CursorPricingConfig } from "./pricing.js";

export type CursorModelRow = {
  id: string;
  name: string;
  reasoning?: boolean;
};

export function resolvePricingFromConfig(pluginConfig?: Record<string, unknown>): CursorPricingConfig {
  const raw = pluginConfig?.pricing;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PRICING_PER_MILLION };
  const p = raw as Record<string, unknown>;
  return {
    input: typeof p.input === "number" ? p.input : DEFAULT_PRICING_PER_MILLION.input,
    output: typeof p.output === "number" ? p.output : DEFAULT_PRICING_PER_MILLION.output,
    cacheRead: typeof p.cacheRead === "number" ? p.cacheRead : DEFAULT_PRICING_PER_MILLION.cacheRead,
    cacheWrite: typeof p.cacheWrite === "number" ? p.cacheWrite : DEFAULT_PRICING_PER_MILLION.cacheWrite,
  };
}

export function staticModelRows(): CursorModelRow[] {
  return STATIC_MODEL_IDS.map((id) => ({
    id,
    name: id === "auto" ? "Auto" : id,
    reasoning: /thinking|codex|opus/i.test(id),
  }));
}

export function toOpenClawModels(rows: CursorModelRow[], pricing?: CursorPricingConfig) {
  const cost = { ...MODEL_DEFAULTS.cost, ...pricing };
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    reasoning: row.reasoning ?? false,
    input: [...MODEL_DEFAULTS.input],
    contextWindow: MODEL_DEFAULTS.contextWindow,
    maxTokens: MODEL_DEFAULTS.maxTokens,
    requestTimeoutMs: MODEL_DEFAULTS.requestTimeoutMs,
    cost: { ...cost },
  }));
}

export async function discoverCursorModels(
  apiKey: string,
  pricing?: CursorPricingConfig,
): Promise<CursorModelRow[]> {
  try {
    const { Cursor } = await import("@cursor/sdk");
    const listed = await Cursor.models.list({ apiKey });
    if (!Array.isArray(listed) || !listed.length) return staticModelRows();
    const rows = listed.map((m) => ({
      id: m.id,
      name: m.displayName || m.id,
      reasoning: /thinking|codex|opus|reason/i.test(m.id),
    }));
    if (!rows.some((r) => r.id === "auto")) {
      rows.unshift({ id: "auto", name: "Auto", reasoning: false });
    }
    return rows;
  } catch {
    return staticModelRows();
  }
}

export function buildProviderConfig(
  apiKey: string,
  models: CursorModelRow[],
  pricing?: CursorPricingConfig,
) {
  return {
    baseUrl: "https://cursor-provider.local/v1",
    apiKey,
    api: "openai-completions" as const,
    timeoutSeconds: 900,
    models: toOpenClawModels(models, pricing),
    provider: PROVIDER_ID,
  };
}
