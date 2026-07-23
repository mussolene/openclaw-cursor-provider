import { calculateCost, type Model, type Usage } from "openclaw/plugin-sdk/llm";
import type { TurnEndedUpdate } from "@cursor/sdk";

export function zeroUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

export function usageFromTurnEnded(update: TurnEndedUpdate | undefined): Usage {
  const u = update?.usage;
  if (!u) return zeroUsage();
  const input = u.inputTokens ?? 0;
  const output = u.outputTokens ?? 0;
  const cacheRead = u.cacheReadTokens ?? 0;
  const cacheWrite = u.cacheWriteTokens ?? 0;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

export function mergeUsage(base: Usage, extra: Partial<Usage>): Usage {
  const input = base.input + (extra.input ?? 0);
  const output = base.output + (extra.output ?? 0);
  const cacheRead = base.cacheRead + (extra.cacheRead ?? 0);
  const cacheWrite = base.cacheWrite + (extra.cacheWrite ?? 0);
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

/** Attach billed cost from model per-million rates (OpenClaw calculateCost). */
export function finalizeUsage(model: Model, usage: Usage): Usage {
  const copy: Usage = {
    ...usage,
    cost: { ...usage.cost },
  };
  calculateCost(model, copy);
  return copy;
}

/** Rough fallback when Cursor omits turn-ended (chars/4 heuristic). */
export function estimateUsageFromText(promptChars: number, outputChars: number): Usage {
  const input = Math.max(0, Math.ceil(promptChars / 4));
  const output = Math.max(0, Math.ceil(outputChars / 4));
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}
