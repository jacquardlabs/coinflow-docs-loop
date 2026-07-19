import type { ChatRequest, ChatResponse, Message, ModelProvider, ToolCall } from "../provider.js";

// Native Anthropic Messages API adapter. Untested without a key — validated at the debrief.
// The one subtlety vs OpenAI: tool results are user-role `tool_result` blocks, and multiple
// results after one assistant turn must be grouped into a single user message.

interface AnthropicBlock {
  type: string;
  [key: string]: unknown;
}
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

function toAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const content: AnthropicBlock[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const t of m.toolCalls ?? []) content.push({ type: "tool_use", id: t.id, name: t.name, input: t.arguments });
      out.push({ role: "assistant", content });
    } else {
      const block: AnthropicBlock = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content };
      const prev = out[out.length - 1];
      if (prev && prev.role === "user" && Array.isArray(prev.content)) {
        prev.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    }
  }
  return out;
}

export function anthropicProvider(model: string): ModelProvider {
  return {
    id: model,
    async complete(req: ChatRequest): Promise<ChatResponse> {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error(`ANTHROPIC_API_KEY is not set — cannot run provider "${model}".`);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature ?? 0,
          system: req.system,
          tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
          messages: toAnthropicMessages(req.messages),
        }),
      });
      if (!res.ok) throw new Error(`${model} HTTP ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as any;
      const blocks = (data.content ?? []) as any[];
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
      const toolCalls: ToolCall[] = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, arguments: (b.input ?? {}) as Record<string, unknown> }));
      return {
        text,
        toolCalls,
        usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
        stop: data.stop_reason === "tool_use" ? "tool_use" : data.stop_reason === "max_tokens" ? "length" : "end",
      };
    },
  };
}
