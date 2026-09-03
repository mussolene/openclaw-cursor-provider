import { calculateCost } from "openclaw/plugin-sdk/llm";
export function zeroUsage() {
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
export function usageFromTurnEnded(update) {
    const u = update?.usage;
    if (!u)
        return zeroUsage();
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
export function mergeUsage(base, extra) {
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
export function finalizeUsage(model, usage) {
    const copy = {
        ...usage,
        cost: { ...usage.cost },
    };
    calculateCost(model, copy);
    return copy;
}
/** Rough fallback when Cursor omits turn-ended (chars/4 heuristic). */
export function estimateUsageFromText(promptChars, outputChars) {
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
