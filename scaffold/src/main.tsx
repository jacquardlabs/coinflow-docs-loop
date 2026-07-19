import { createRoot } from "react-dom/client";
import { App } from "./App";

// Coinflow config is injected at boot; the stub SDK + App read it. The verifier / server
// set these from resolveCoinflowEnv(), so the same code targets mock / sandbox / prod.
const g = window as unknown as {
  __COINFLOW_MOCK_BASE__?: string;
  __COINFLOW_MERCHANT_ID__?: string;
  __COINFLOW_ENV__?: string;
};
g.__COINFLOW_MOCK_BASE__ = import.meta.env.VITE_COINFLOW_MOCK_BASE ?? "http://localhost:4000";
g.__COINFLOW_MERCHANT_ID__ = import.meta.env.VITE_COINFLOW_MERCHANT_ID ?? "applied-ai";
g.__COINFLOW_ENV__ = import.meta.env.VITE_COINFLOW_ENV ?? "sandbox";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
