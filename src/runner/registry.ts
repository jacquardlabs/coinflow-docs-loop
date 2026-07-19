import type { ModelProvider } from "./provider.js";
import { loadEnv } from "./env.js";
import { mockProvider } from "./providers/mock.js";
import type { MockThresholds } from "./providers/mock.js";
import { anthropicProvider } from "./providers/anthropic.js";
import { openAICompatibleProvider } from "./providers/openai-compatible.js";

// Graded mock readers: stricter variants need signals shown in code examples, not just
// prose. Panel = the two easier readers; holdout = the strict one (see run-panel.ts).
const MOCK_VARIANTS: Record<string, MockThresholds> = {
  mock: { correctRef: 1, handle410: 1, deviceId: 1, auth: 1 },
  "mock-lenient": { correctRef: 1, handle410: 1, deviceId: 1, auth: 1 },
  "mock-careful": { correctRef: 1, handle410: 1, deviceId: 2, auth: 2 },
  "mock-literal": { correctRef: 1, handle410: 2, deviceId: 2, auth: 2 },
};

// Adding a model is a line here — an id → provider. Same interface for mock, hosted, and
// self-hosted. Panel composition and holdout selection are just lists of these ids.
export function getProvider(id: string): ModelProvider {
  loadEnv(); // pick up a .env if present; exported vars / secrets managers still win
  const thresholds = MOCK_VARIANTS[id];
  if (thresholds) return mockProvider({ id, thresholds });

  switch (id) {
    case "claude":
      return anthropicProvider("claude-opus-4-8");
    case "gpt":
      return openAICompatibleProvider({ model: "gpt-4o" });
    case "local":
      return openAICompatibleProvider({
        model: process.env.LOCAL_MODEL ?? "local-model",
        baseURL: process.env.LOCAL_BASE_URL ?? "http://localhost:8000/v1",
        apiKeyEnv: "LOCAL_API_KEY",
      });
    default:
      throw new Error(`Unknown provider id: "${id}" (known: ${Object.keys(MOCK_VARIANTS).join(", ")}, claude, gpt, local)`);
  }
}
