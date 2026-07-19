import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

// Load a repo-root `.env` if present, WITHOUT overriding already-set vars — so exported
// shell vars, CI secrets, or `doppler run -- …` always win over the file. Zero-dependency
// on purpose: the point is that a user can supply keys however they like.
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const file = path.join(repo, ".env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
