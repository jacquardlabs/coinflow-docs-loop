# Self-improving, model-agnostic docs for agent-native SDK integration

The docs page is the artifact under optimization. **Integration success is the loss function.**

An **implementer** agent reads one Coinflow docs page (plus a task and sandbox) and produces a
runnable Zero-Authorization → Card-on-File integration. A deterministic **verifier** proves the
integration actually works — it boots the app and drives the real card-entry iframe with a headless
browser. Failure signals feed a **docs-editor** that makes targeted edits to the page. The whole thing
runs across a **panel of models** with one held out, so the docs never overfit to one model.

```
docs page ──▶ implementer (model-agnostic) ──▶ integration ──▶ verifier ──▶ scorecard
   ▲                                                                            │
   └────────────────── docs-editor ◀── failure signals ◀───────────────────────┘
              (targeted edits, under a length budget, until the panel plateaus)
```

## The metric (rubric v2)

A single run scores a **weighted line-item vector**, not a bare pass/fail — the editor needs a
gradient, the scorecard needs an honest headline. See `src/rubric/rubric.ts`.

| line-item | tier | weight | failure signal |
|---|---|---|---|
| boots | gating | 0.10 | `build_failed` |
| ZA renders | gating | 0.15 | `za_did_not_render` |
| onSuccess + paymentId | gating | 0.25 | `no_payment_id` |
| COF references paymentId correctly | gating | 0.20 | `wrong_reference_field` |
| graceful 410 | additive | 0.15 | `unhandled_410` |
| COF auth headers | additive | 0.08 | `missing_auth_headers` |
| nSure device id | additive | 0.07 | `missing_nsure_device_id` |

- **`roll_up`** (0–1) is the gradient the editor optimizes.
- **`full_pass`** = every *gating* line-item green. The gating tier **vetoes** the roll-up — an edit is
  accepted only if it regresses no gating item (enforced in `src/loop/optimize.ts`: a regressing edit is
  rejected and not shipped). So the composite can never rise while the core flow breaks.
- Every score is stamped with `rubric_version`; adding a failure mode is one registry entry + a re-baseline.
  **v2** added `cof_auth`, promoted from a live-sandbox probe (`docs/worked-example/live-sandbox-probe.md`) — the discovery→promotion loop in action.

## Mock-first, live-capable

The loop's default is a **deterministic mock** of the Coinflow surface (`src/mock/`): a stateful oracle
(issues real `paymentId`s, validates the reference field, trips a real `410` by controlling the velocity
config) + a contract-faithful stub of `@coinflow/react` + a mock-served card-entry iframe. This makes the
loop **deterministic, offline, CI-safe, and zero-blast-radius** — an autonomous loop never hammers the
live sandbox. Live mode swaps the same integration code onto the real SDK/sandbox as a validation adapter.

## Run it

```bash
pnpm install                        # Node 22, pnpm; installs Playwright
pnpm exec playwright install chromium

make smoke        # prove the oracle's deterministic core (no browser)
make verify       # score a golden fixture (good | v0 | broken): pnpm verify golden-broken
make implement    # one implementer run: mock reads v0 docs, verifier scores it
make panel        # score a docs version across the 2-model panel + strict holdout
make eval         # the full loop: panel → edit → panel; drops before/after + diff in artifacts/eval/
```

Live models — supply keys however you like; the loop auto-loads a repo-root `.env`, and
exported vars or a secrets manager override it:

```bash
cp .env.example .env        # then fill in ANTHROPIC_API_KEY / OPENAI_API_KEY
pnpm implement claude za-guide.v0
pnpm implement gpt   za-guide.v1

# equivalently, without a file:
ANTHROPIC_API_KEY=sk-ant-... pnpm implement claude za-guide.v0
# or via any secrets manager, e.g. Doppler:
doppler run -- pnpm implement claude za-guide.v0
```

## Targeting a Coinflow environment

The same integration + harness run against any Coinflow env via env vars — `mock` is the
default and needs no keys. `resolveCoinflowEnv()` (`src/config/coinflow-env.ts`) is the single
seam; `merchantId`, `env`, and `apiKey` flow from it through the contract into the integration.

| var | mock (default) | sandbox | prod |
|---|---|---|---|
| `COINFLOW_MODE` | `mock` | `sandbox` | `prod` |
| `apiBase` | injected mock URL | `api-sandbox.coinflow.cash` | `api.coinflow.cash` |
| SDK | aliased stub | real `@coinflow/react` | real `@coinflow/react` |
| `COINFLOW_MERCHANT_ID` | `applied-ai` | yours | yours |
| `COINFLOW_API_KEY` | — | required | required |

*`sandbox` is validated by `pnpm probe`; `prod` is wired but unexercised (no prod creds) — treat it as untested.*

Validate the mock's contract against the real sandbox API (needs the key):

```bash
COINFLOW_MODE=sandbox COINFLOW_API_KEY=… pnpm probe
```

Sandbox/prod **browser** runs additionally need the real `@coinflow/react` installed and the
live hosted-iframe selectors (a documented extension); the mock path and `pnpm probe` need neither.

## Model-agnostic runner

Every provider implements one interface (`src/runner/provider.ts`); a minimal agentic tool-use loop runs
on top (`src/harness/agent.ts`). Adding a frontier model is a line in `src/runner/registry.ts`, not a
rewrite. Adapters: `mock` (offline default), `claude` (Anthropic), and OpenAI-compatible `gpt` (OpenAI,
pinned snapshot) / `gemini` (Google) / `local` (vLLM, TGI, … via base URL + model string).

## Layout

```
src/mock/         oracle API + stub @coinflow/react + fake iframe   (the substrate)
src/rubric/       the metric as code (line-items, weights, full_pass)
src/verifier/     boot + Playwright drive + structured scorecard
scaffold/         fixed Vite+React+Express shell; agent fills frontend.tsx + charge.ts
fixtures/         golden good / v0 / broken integrations (verifier trusted before any LLM)
src/runner/       provider adapters + registry
src/harness/      implementer agent loop, task/contract, panel runner
src/editor/       ground-truthed, budgeted docs-editor
src/loop/         optimize loop + gating veto + `make eval`
docs/             za-guide.v0.md (as-is), za-guide.v1.md (optimized), worked-example/, writeup.md
```

## Proof

`docs/worked-example/` — the before/after, the doc diff, live scorecards + full run dirs (`runs/`), and a
live-sandbox probe. Headline: panel and held-out model both **0.70 → 1.00**, and **live Claude 0.70 → 1.00**,
from a three-section, in-budget edit. The honest counterpoint: **live GPT-4o stayed 0.50 → 0.50** — it learned
the edits but hallucinates the COF endpoint, a gap the mock panel never showed (see the two-real-models
table). That divergence is the case for real, diverse models in the panel.

Design rationale, brittleness, cost/latency, and CI wiring: **`docs/writeup.md`**.
