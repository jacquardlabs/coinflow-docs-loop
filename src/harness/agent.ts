import path from "node:path";
import type { AgentTask } from "./task.js";
import type { Message, ModelProvider, Usage } from "../runner/provider.js";

export interface AgentRunResult {
  files: Record<string, string>;
  steps: number;
  usage: Usage;
  transcript: Message[];
  stopReason: string;
}

// A minimal but real agentic tool-use loop: the model takes turns, we apply its write_file
// calls, and stop when it submits or hits the step budget. Identical for mock and real
// providers, so the mock is not a different code path. Captures transcript, tokens, steps.
export async function runAgent(provider: ModelProvider, task: AgentTask, maxSteps = 8): Promise<AgentRunResult> {
  const messages: Message[] = [{ role: "user", content: task.initialUser }];
  const files: Record<string, string> = {};
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let steps = 0;
  let stopReason = "max_steps";

  for (steps = 1; steps <= maxSteps; steps += 1) {
    const res = await provider.complete({ system: task.system, messages, tools: task.tools, temperature: 0 });
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    messages.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls });

    if (res.toolCalls.length === 0) {
      stopReason = "no_tool_calls";
      break;
    }

    let submitted = false;
    for (const call of res.toolCalls) {
      if (call.name === "write_file") {
        const name = typeof call.arguments.path === "string" ? path.basename(call.arguments.path) : "unnamed";
        const content = typeof call.arguments.content === "string" ? call.arguments.content : "";
        files[name] = content;
        messages.push({ role: "tool", toolCallId: call.id, content: `wrote ${name} (${content.length} bytes)` });
      } else if (call.name === "submit") {
        submitted = true;
        messages.push({ role: "tool", toolCallId: call.id, content: "submitted" });
      } else {
        messages.push({ role: "tool", toolCallId: call.id, content: `unknown tool: ${call.name}` });
      }
    }
    if (submitted) {
      stopReason = "submitted";
      break;
    }
  }

  return { files, steps, usage, transcript: messages, stopReason };
}
