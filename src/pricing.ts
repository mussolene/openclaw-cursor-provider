import type { Model } from "openclaw/plugin-sdk/llm";

/** Per-million token pricing (OpenClaw convention). */
export interface CursorPricingConfig {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export const DEFAULT_PRICING_PER_MILLION: Required<CursorPricingConfig> = {
  /** Cursor Auto / blended hosted estimate — override in plugin config. */
  input: 2.0,
  output: 8.0,
  cacheRead: 0.5,
  cacheWrite: 2.0,
};

export function resolveModelPricing(
  model: Model,
  pluginPricing?: CursorPricingConfig,
): Model["cost"] {
  const base = { ...DEFAULT_PRICING_PER_MILLION, ...pluginPricing };
  const fromModel = model.cost;
  return {
    input: (fromModel?.input ?? 0) > 0 ? fromModel?.input : base.input,
    output: (fromModel?.output ?? 0) > 0 ? fromModel?.output : base.output,
    cacheRead: (fromModel?.cacheRead ?? 0) > 0 ? fromModel?.cacheRead : base.cacheRead,
    cacheWrite: (fromModel?.cacheWrite ?? 0) > 0 ? fromModel?.cacheWrite : base.cacheWrite,
  };
}
