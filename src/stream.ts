import { Agent, CursorAgentError, type InteractionUpdate, type SDKAgent, type TurnEndedUpdate } from "@cursor/sdk";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type StreamFn,
  type TextContent,
  type ThinkingContent,
  type ToolCall,
} from "openclaw/plugin-sdk/llm";
import { ensureCursorSdkBootstrapped } from "./bootstrap.js";
import type { ChatModeConfig } from "./config.js";
import { DEFAULT_CHAT_MODE_CONFIG } from "./config.js";
import { conversationHadInternalTools } from "./conversation-audit.js";
import { needsTools } from "./intent.js";
import { buildCursorFollowUpPrompt, buildCursorPrompt, buildSlimCursorPrompt, shouldSendFullPrompt } from "./prompt.js";
import { deleteCursorSession, getCursorSession, upsertCursorSession } from "./session-store.js";
import { openClawToolNames, parseCursorToolIntent } from "./tool-events.js";
import { buildOpenClawCustomTools } from "./tools-bridge.js";
import { estimateUsageFromText, finalizeUsage, usageFromTurnEnded, zeroUsage } from "./usage.js";

type RunStop =
  | { kind: "stop"; text: string; thinking: string; usage: ReturnType<typeof zeroUsage> }
  | { kind: "toolUse"; toolCall: ToolCall; text: string; thinking: string; usage: ReturnType<typeof zeroUsage> }
  | { kind: "error"; message: string; text: string; thinking: string; usage: ReturnType<typeof zeroUsage> };

export type CursorStreamFnOptions = {
  resolveApiKey: (options?: SimpleStreamOptions) => string | undefined;
  resolveWorkspaceDir: (options?: SimpleStreamOptions) => string;
  /** When true (default), reject runs where Cursor executed built-in tools internally. */
  strictToolLoop?: boolean;
  applyModelPricing?: (model: Model) => Model;
  chatModeConfig?: ChatModeConfig;
  logDebug?: (message: string, meta?: Record<string, unknown>) => void;
};

function mapModelId(modelId: string): string {
  const id = modelId?.trim();
  if (!id || id === "auto") return "auto";
  return id;
}

function resolveSessionId(options?: SimpleStreamOptions): string | undefined {
  const fromOptions = options?.sessionId?.trim();
  if (fromOptions) return fromOptions;
  const meta = options?.metadata;
  if (meta && typeof meta.sessionKey === "string" && meta.sessionKey.trim()) {
    return meta.sessionKey.trim();
  }
  if (meta && typeof meta.sessionId === "string" && meta.sessionId.trim()) {
    return meta.sessionId.trim();
  }
  return undefined;
}

function buildAssistant(
  model: Model,
  params: {
    text: string;
    thinking: string;
    toolCall?: ToolCall;
    stopReason: AssistantMessage["stopReason"];
    usage?: AssistantMessage["usage"];
    errorMessage?: string;
  },
): AssistantMessage {
  const content: Array<TextContent | ThinkingContent | ToolCall> = [];
  if (params.thinking) content.push({ type: "thinking", thinking: params.thinking });
  if (params.text) content.push({ type: "text", text: params.text });
  if (params.toolCall) content.push(params.toolCall);
  return {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: params.usage ?? zeroUsage(),
    stopReason: params.stopReason,
    errorMessage: params.errorMessage,
    timestamp: Date.now(),
  };
}

function deltaChunk(update: InteractionUpdate): string | undefined {
  if (update.type !== "text-delta" && update.type !== "thinking-delta") return undefined;
  const text = "text" in update && typeof update.text === "string" ? update.text : "";
  return text || undefined;
}

function syntheticToolUpdate(step: {
  message?: { type?: string; args?: unknown };
  callId?: string;
}): InteractionUpdate | undefined {
  const toolType = step.message?.type;
  if (!toolType) return undefined;
  return {
    type: "tool-call-started",
    callId: step.callId ?? `step-${Date.now()}`,
    toolCall: step.message,
  } as InteractionUpdate;
}

async function resolveAgent(params: {
  apiKey: string;
  modelId: string;
  cwd: string;
  sessionId?: string;
  chatOnly?: boolean;
}): Promise<SDKAgent> {
  if (!params.chatOnly && params.sessionId) {
    const existing = await getCursorSession(params.sessionId);
    if (existing?.agentId) {
      try {
        return await Agent.resume(existing.agentId, {
          apiKey: params.apiKey,
          model: { id: params.modelId },
          local: { cwd: params.cwd, settingSources: [] },
        });
      } catch {
        await deleteCursorSession(params.sessionId);
      }
    }
  }

  return Agent.create({
    apiKey: params.apiKey,
    model: { id: params.modelId },
    local: { cwd: params.cwd, settingSources: [] },
  });
}

async function touchSession(
  sessionId: string | undefined,
  agentId: string,
  modelId: string,
  bootstrapped?: boolean,
): Promise<void> {
  if (!sessionId) return;
  const existing = await getCursorSession(sessionId);
  await upsertCursorSession({
    agentId,
    sessionId,
    createdAt: existing?.createdAt ?? Date.now(),
    lastUsedAt: Date.now(),
    modelId,
    bootstrapped: bootstrapped ?? existing?.bootstrapped,
  });
}

const TURN_ENDED_DRAIN_MS = 8_000;

export function createCursorSdkStreamFn(params: CursorStreamFnOptions): StreamFn {
  const strictToolLoop = params.strictToolLoop !== false;
  const chatModeConfig = params.chatModeConfig ?? DEFAULT_CHAT_MODE_CONFIG;
  const logDebug = params.logDebug ?? (() => undefined);

  return (model, context, options) => {
    const stream = createAssistantMessageEventStream();
    const billedModel = params.applyModelPricing?.(model) ?? model;
    const modelId = mapModelId(model.id);
    const openClawContext = context as Context;

    void (async () => {
      let agent: SDKAgent | undefined;
      let accumulatedText = "";
      let accumulatedThinking = "";
      let textStarted = false;
      let thinkingStarted = false;
      let thinkingEnded = false;
      let toolCallStarted = false;
      let turnEnded: TurnEndedUpdate | undefined;
      let pendingStop: RunStop | undefined;
      let shouldCancelRun = false;
      let stopDrainDeadline = 0;
      let tokenDeltaCount = 0;
      let promptChars = 0;
      let toolTurn = false;
      let activeRun: Awaited<ReturnType<SDKAgent["send"]>> | undefined;
      let sentFullPrompt = false;

      const allowedTools = openClawToolNames(openClawContext.tools);

      const rawUsage = () => {
        const fromTurn = usageFromTurnEnded(turnEnded);
        if (fromTurn.totalTokens > 0) return fromTurn;
        if (tokenDeltaCount > 0) {
          return {
            ...fromTurn,
            output: Math.max(fromTurn.output, tokenDeltaCount),
            totalTokens: fromTurn.input + Math.max(fromTurn.output, tokenDeltaCount) + fromTurn.cacheRead + fromTurn.cacheWrite,
          };
        }
        return fromTurn;
      };

      const billedUsage = () => finalizeUsage(billedModel, rawUsage());

      const pushPartial = (stopReason: AssistantMessage["stopReason"] = "stop", toolCall?: ToolCall) =>
        buildAssistant(billedModel, {
          text: accumulatedText,
          thinking: accumulatedThinking,
          toolCall,
          stopReason,
          usage: billedUsage(),
        });

      const handleToolIntent = (intent: ReturnType<typeof parseCursorToolIntent>) => {
        if (!intent || pendingStop) return;

        if (intent.kind === "openclaw") {
          pendingStop = {
            kind: "toolUse",
            toolCall: intent.toolCall,
            text: accumulatedText,
            thinking: accumulatedThinking,
            usage: billedUsage(),
          };
          shouldCancelRun = true;
          stopDrainDeadline = Date.now() + TURN_ENDED_DRAIN_MS;
          return;
        }

        if (intent.kind === "forbidden-builtin") {
          pendingStop = {
            kind: "error",
            message: `Cursor built-in tool "${intent.builtinType}" is disabled — use OpenClaw tools (tool_call / read / exec).`,
            text: accumulatedText,
            thinking: accumulatedThinking,
            usage: billedUsage(),
          };
          shouldCancelRun = true;
          stopDrainDeadline = Date.now() + TURN_ENDED_DRAIN_MS;
          return;
        }

        if (intent.kind === "foreign-mcp") {
          pendingStop = {
            kind: "error",
            message: `Unexpected MCP tool "${intent.toolName}" — only OpenClaw-registered tools are allowed.`,
            text: accumulatedText,
            thinking: accumulatedThinking,
            usage: billedUsage(),
          };
          shouldCancelRun = true;
          stopDrainDeadline = Date.now() + TURN_ENDED_DRAIN_MS;
        }
      };

      stream.push({ type: "start", partial: pushPartial() });

      const appendTextDelta = (chunk: string) => {
        if (!chunk) return;
        if (!textStarted) {
          textStarted = true;
          stream.push({
            type: "text_start",
            contentIndex: thinkingStarted ? 1 : 0,
            partial: pushPartial(),
          });
        }
        accumulatedText += chunk;
        stream.push({
          type: "text_delta",
          contentIndex: thinkingStarted ? 1 : 0,
          delta: chunk,
          partial: pushPartial(),
        });
      };

      const appendThinkingDelta = (chunk: string) => {
        if (!chunk) return;
        if (!thinkingStarted) {
          thinkingStarted = true;
          stream.push({ type: "thinking_start", contentIndex: 0, partial: pushPartial() });
        }
        accumulatedThinking += chunk;
        stream.push({
          type: "thinking_delta",
          contentIndex: 0,
          delta: chunk,
          partial: pushPartial(),
        });
      };

      const finalizeThinking = () => {
        if (thinkingStarted && !thinkingEnded) {
          thinkingEnded = true;
          stream.push({
            type: "thinking_end",
            contentIndex: 0,
            content: accumulatedThinking,
            partial: pushPartial(),
          });
        }
      };

      const finalizeText = () => {
        if (!textStarted && accumulatedText) {
          appendTextDelta(accumulatedText);
        }
        if (textStarted) {
          stream.push({
            type: "text_end",
            contentIndex: thinkingStarted ? 1 : 0,
            content: accumulatedText,
            partial: pushPartial(),
          });
        }
      };

      const emitToolCall = (toolCall: ToolCall) => {
        if (!toolCallStarted) {
          toolCallStarted = true;
          const contentIndex = (thinkingStarted ? 1 : 0) + (textStarted ? 1 : 0);
          stream.push({
            type: "toolcall_start",
            contentIndex,
            partial: pushPartial("toolUse", toolCall),
          });
        }
        stream.push({
          type: "toolcall_end",
          contentIndex: (thinkingStarted ? 1 : 0) + (textStarted ? 1 : 0),
          toolCall,
          partial: pushPartial("toolUse", toolCall),
        });
      };

      const onDelta = (update: InteractionUpdate) => {
        const chunk = deltaChunk(update);
        if (update.type === "thinking-delta" && chunk) appendThinkingDelta(chunk);
        if (update.type === "thinking-completed") finalizeThinking();
        if (update.type === "text-delta" && chunk) appendTextDelta(chunk);
        if (update.type === "turn-ended") turnEnded = update;
        if (update.type === "token-delta" && "tokens" in update && typeof update.tokens === "number") {
          tokenDeltaCount += update.tokens;
        }

        const intent = parseCursorToolIntent(update, allowedTools);
        handleToolIntent(intent);
      };

      try {
        ensureCursorSdkBootstrapped();
        const apiKey = params.resolveApiKey(options);
        if (!apiKey) {
          throw new CursorAgentError("CURSOR_API_KEY is not configured", { isRetryable: false });
        }

        if (options?.signal?.aborted) {
          throw new CursorAgentError("aborted", { isRetryable: false });
        }

        const cwd = params.resolveWorkspaceDir(options);
        const sessionId = resolveSessionId(options);
        const sessionRecord = sessionId ? await getCursorSession(sessionId) : undefined;
        toolTurn = needsTools(openClawContext, chatModeConfig);
        const customTools = toolTurn ? buildOpenClawCustomTools(openClawContext.tools) : {};

        sentFullPrompt = shouldSendFullPrompt({
          context: openClawContext,
          sessionBootstrapped: sessionRecord?.bootstrapped === true,
          config: chatModeConfig,
        });

        const prompt = sentFullPrompt
          ? buildCursorPrompt(openClawContext, chatModeConfig)
          : toolTurn
            ? buildCursorFollowUpPrompt(openClawContext, chatModeConfig)
            : buildSlimCursorPrompt(openClawContext, chatModeConfig);
        promptChars = prompt.length;

        logDebug("cursor-provider turn", {
          toolTurn,
          sentFullPrompt,
          promptChars,
          chatMode: chatModeConfig.chatMode,
          customToolCount: Object.keys(customTools).length,
        });

        agent = await resolveAgent({
          apiKey,
          modelId,
          cwd,
          sessionId,
          chatOnly: !toolTurn,
        });

        activeRun = await agent.send(prompt, {
          model: { id: modelId },
          onDelta: ({ update }) => onDelta(update),
          onStep: ({ step }) => {
            if (step.type === "toolCall" && step.message) {
              const synthetic = syntheticToolUpdate({
                message: step.message as { type?: string; args?: unknown },
                callId: (step as { callId?: string }).callId,
              });
              if (synthetic) handleToolIntent(parseCursorToolIntent(synthetic, allowedTools));
            }
          },
          local: { customTools },
        });

        const abortListener = () => {
          void activeRun?.cancel().catch(() => undefined);
        };
        options?.signal?.addEventListener("abort", abortListener, { once: true });

        try {
          for await (const _event of activeRun.stream()) {
            if (options?.signal?.aborted) break;
            if (pendingStop) {
              if (turnEnded) break;
              if (stopDrainDeadline > 0 && Date.now() > stopDrainDeadline) break;
            }
          }
        } finally {
          options?.signal?.removeEventListener("abort", abortListener);
        }

        if (shouldCancelRun) {
          await activeRun.cancel().catch(() => undefined);
        } else if (!pendingStop) {
          const result = await activeRun.wait();
          if (result.result?.trim() && !accumulatedText.trim()) {
            accumulatedText = result.result.trim();
          }

          if (strictToolLoop && toolTurn && activeRun.supports("conversation")) {
            const turns = await activeRun.conversation().catch(() => []);
            if (conversationHadInternalTools(turns)) {
              pendingStop = {
                kind: "error",
                message:
                  "Cursor executed built-in tools internally (Mode A). OpenClaw provider requires tools via harness — retry or use sessions_spawn/ACP for deep file work.",
                text: accumulatedText,
                thinking: accumulatedThinking,
                usage: billedUsage(),
              };
            }
          }

          if (!pendingStop) {
            if (result.status === "error") {
              pendingStop = {
                kind: "error",
                message: "Cursor agent run failed",
                text: accumulatedText,
                thinking: accumulatedThinking,
                usage: billedUsage(),
              };
            } else if (options?.signal?.aborted) {
              pendingStop = {
                kind: "error",
                message: "aborted",
                text: accumulatedText,
                thinking: accumulatedThinking,
                usage: billedUsage(),
              };
            } else {
              pendingStop = {
                kind: "stop",
                text: accumulatedText,
                thinking: accumulatedThinking,
                usage: billedUsage(),
              };
            }
          }
        }

        if (pendingStop && rawUsage().totalTokens === 0) {
          const estimated = estimateUsageFromText(promptChars, accumulatedText.length + accumulatedThinking.length);
          turnEnded = {
            type: "turn-ended",
            usage: {
              inputTokens: estimated.input,
              outputTokens: estimated.output,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
          };
          pendingStop = { ...pendingStop, usage: billedUsage() };
        } else if (pendingStop) {
          pendingStop = { ...pendingStop, usage: billedUsage() };
        } else {
          pendingStop = {
            kind: "stop",
            text: accumulatedText,
            thinking: accumulatedThinking,
            usage: billedUsage(),
          };
        }

        finalizeThinking();
        finalizeText();

        if (agent && sessionId) {
          const bootstrapped = sessionRecord?.bootstrapped === true || (toolTurn && sentFullPrompt);
          if (toolTurn) {
            await touchSession(sessionId, agent.agentId, modelId, bootstrapped);
          } else if (sessionRecord) {
            await upsertCursorSession({
              ...sessionRecord,
              lastUsedAt: Date.now(),
              bootstrapped: bootstrapped || sessionRecord.bootstrapped,
            });
          }
        }

        if (pendingStop.kind === "toolUse") {
          emitToolCall(pendingStop.toolCall);
          const final = buildAssistant(billedModel, {
            text: pendingStop.text,
            thinking: pendingStop.thinking,
            toolCall: pendingStop.toolCall,
            stopReason: "toolUse",
            usage: pendingStop.usage,
          });
          stream.push({ type: "done", reason: "toolUse", message: final });
          stream.end(final);
          return;
        }

        if (pendingStop.kind === "error") {
          const isAbort = /abort/i.test(pendingStop.message);
          const final = buildAssistant(billedModel, {
            text: pendingStop.text,
            thinking: pendingStop.thinking,
            stopReason: isAbort ? "aborted" : "error",
            usage: pendingStop.usage,
            errorMessage: pendingStop.message,
          });
          stream.push({ type: "error", reason: isAbort ? "aborted" : "error", error: final });
          stream.end(final);
          return;
        }

        const final = buildAssistant(billedModel, {
          text: pendingStop.text,
          thinking: pendingStop.thinking,
          stopReason: "stop",
          usage: pendingStop.usage,
        });
        stream.push({ type: "done", reason: "stop", message: final });
        stream.end(final);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isAbort = /abort/i.test(msg);
        const usage =
          rawUsage().totalTokens > 0
            ? billedUsage()
            : finalizeUsage(billedModel, estimateUsageFromText(promptChars, accumulatedText.length));
        const final = buildAssistant(billedModel, {
          text: accumulatedText,
          thinking: accumulatedThinking,
          stopReason: isAbort ? "aborted" : "error",
          usage,
          errorMessage: msg,
        });
        stream.push({ type: "error", reason: isAbort ? "aborted" : "error", error: final });
        stream.end(final);
      }
    })();

    return stream;
  };
}
