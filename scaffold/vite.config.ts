import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const mode = process.env.COINFLOW_MODE ?? "mock";
const integrationDir = process.env.INTEGRATION_DIR ?? path.resolve(dir, "../fixtures/golden-good");

// The verifier picks the active integration (INTEGRATION_DIR) and the SDK (COINFLOW_MODE).
// Mock below the integration: swap the SDK by alias, never touch the integration code.
const alias: Record<string, string> = {
  "@integration/frontend": path.resolve(integrationDir, "frontend.tsx"),
};
if (mode === "mock") {
  alias["@coinflow/react"] = path.resolve(dir, "../src/mock/sdk/index.tsx");
}

export default defineConfig({
  root: dir,
  plugins: [react()],
  resolve: { alias },
  server: { host: "127.0.0.1" },
});
