import type { ChatRequest, ChatResponse, Message, ModelProvider, ToolCall } from "../provider.js";

// One adapter for OpenAI *and* every OpenAI-compatible endpoint (vLLM, TGI, an internal
// GLM, …): base URL + model string + key env. Untested without a key — validated at the
// debrief; the mock provider is the offline default.

export interface OpenAICompatibleOpts {
  model: string;
  baseURL?: string;
  apiKeyEnv?: string;
}

function toOpenAIMessages(system: string, messages: Message[]): unknown[] {
  const out: unknown[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls?.map((t) => ({
          id: t.id,
          type: "function",
          function: { name: t.name, arguments: JSON.stringify(t.arguments) },
        })),
      });
    } else {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return out;
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function openAICompatibleProvider(opts: OpenAICompatibleOpts): ModelProvider {
  const baseURL = opts.baseURL ?? "https://api.openai.com/v1";
  const apiKeyEnv = opts.apiKeyEnv ?? "OPENAI_API_KEY";
  return {
    id: opts.model,
    async complete(req: ChatRequest): Promise<ChatResponse> {
      const key = process.env[apiKeyEnv];
      if (!key) throw new Error(`${apiKeyEnv} is not set — cannot run provider "${opts.model}".`);
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: opts.model,
          temperature: req.temperature ?? 0,
          seed: 7, // fix the seed where the provider allows it (best-effort determinism)
          max_tokens: req.maxTokens ?? 4096,
          messages: toOpenAIMessages(req.system, req.messages),
          tools: req.tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        }),
      });
      if (!res.ok) throw new Error(`${opts.model} HTTP ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as any;
      const choice = data.choices?.[0];
      const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((c: any) => ({
        id: c.id,
        name: c.function.name,
        arguments: safeJson(c.function.arguments),
      }));
      return {
        text: choice?.message?.content ?? "",
        toolCalls,
        usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
        stop: toolCalls.length > 0 ? "tool_use" : choice?.finish_reason === "length" ? "length" : "end",
      };
    },
  };
}
