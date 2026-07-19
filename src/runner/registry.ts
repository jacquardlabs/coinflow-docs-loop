import type { ModelProvider } from "./provider.js";
import { mockProvider } from "./providers/mock.js";
import { anthropicProvider } from "./providers/anthropic.js";
import { openAICompatibleProvider } from "./providers/openai-compatible.js";

// The whole "adding a model is a config line" claim lives here. Panel composition and
// holdout selection are just lists of these ids (step 6).
export function getProvider(id: string): ModelProvider {
  switch (id) {
    case "mock":
      return mockProvider();
    case "claude":
      return anthropicProvider("claude-opus-4-8");
    case "gpt":
      return openAICompatibleProvider({ model: "gpt-4o" });
    case "local":
      // A self-hosted OpenAI-compatible endpoint: base URL + model + key via env.
      return openAICompatibleProvider({
        model: process.env.LOCAL_MODEL ?? "local-model",
        baseURL: process.env.LOCAL_BASE_URL ?? "http://localhost:8000/v1",
        apiKeyEnv: "LOCAL_API_KEY",
      });
    default:
      throw new Error(`Unknown provider id: "${id}" (known: mock, claude, gpt, local)`);
  }
}
