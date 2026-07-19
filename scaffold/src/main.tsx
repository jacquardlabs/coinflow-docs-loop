import { createRoot } from "react-dom/client";
import { App } from "./App";

// The mock's base URL is injected at boot; the stub SDK reads it to build the iframe src.
(window as unknown as { __COINFLOW_MOCK_BASE__?: string }).__COINFLOW_MOCK_BASE__ =
  import.meta.env.VITE_COINFLOW_MOCK_BASE ?? "http://localhost:4000";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
