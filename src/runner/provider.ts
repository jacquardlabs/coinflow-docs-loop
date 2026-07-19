// The model-agnostic seam. Every provider — mock, Anthropic, OpenAI, a self-hosted
// OpenAI-compatible endpoint — implements this one interface. Adding a frontier model is
// a new adapter file + a line in the registry, never a change to the harness or verifier.

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatRequest {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: Usage;
  stop: "tool_use" | "end" | "length";
}

export interface ModelProvider {
  id: string;
  complete(req: ChatRequest): Promise<ChatResponse>;
}
