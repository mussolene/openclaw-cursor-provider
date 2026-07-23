declare module "openclaw/plugin-sdk/llm" {
  export interface UsageCost {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  }

  export interface Usage {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: UsageCost;
  }

  export interface Model {
    id: string;
    name?: string;
    provider: string;
    api: string;
    cost?: Partial<UsageCost>;
    input?: readonly string[];
    contextWindow?: number;
    maxTokens?: number;
    requestTimeoutMs?: number;
    reasoning?: boolean;
    baseUrl?: string;
  }

  export interface TextContent {
    type: "text";
    text: string;
  }

  export interface ThinkingContent {
    type: "thinking";
    thinking: string;
  }

  export interface ImageContent {
    type: "image";
    image?: string;
    mediaType?: string;
  }

  export interface ToolCall {
    type: "toolCall";
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }

  export type Message =
    | { role: "user"; content: string | Array<TextContent | ImageContent>; timestamp?: number }
    | { role: "assistant"; content: Array<TextContent | ThinkingContent | ToolCall>; timestamp?: number }
    | {
        role: "toolResult";
        toolCallId: string;
        toolName: string;
        content: string | Array<TextContent | ImageContent>;
        isError?: boolean;
        timestamp?: number;
      };

  export interface Tool {
    name: string;
    description?: string;
    parameters?: unknown;
  }

  export interface Context {
    systemPrompt?: string;
    messages?: Message[];
    tools?: Tool[];
  }

  export interface SimpleStreamOptions {
    apiKey?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
    signal?: AbortSignal;
  }

  export interface AssistantMessage {
    role: "assistant";
    content: Array<TextContent | ThinkingContent | ToolCall>;
    api: string;
    provider: string;
    model: string;
    usage: Usage;
    stopReason: "stop" | "toolUse" | "error" | "aborted";
    errorMessage?: string;
    timestamp: number;
  }

  export type StreamFn = (model: Model, context: Context, options?: SimpleStreamOptions) => unknown;

  export function createAssistantMessageEventStream(): {
    push(event: unknown): void;
    end(message: AssistantMessage): void;
  };

  export function calculateCost(model: Model, usage: Usage): void;
}

declare module "openclaw/plugin-sdk/plugin-entry" {
  export function definePluginEntry<T>(entry: T): T;
}

declare module "openclaw/plugin-sdk/provider-auth" {
  export function createProviderApiKeyAuthMethod(config: Record<string, unknown>): unknown;
}

declare module "openclaw/plugin-sdk/provider-model-shared" {
  export function buildProviderReplayFamilyHooks(config: Record<string, unknown>): Record<string, unknown>;
}
