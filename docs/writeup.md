# Writeup — self-improving, model-agnostic docs

## The metric, and why it's shaped this way

The loss function is one question: can an agent ship a working ZA→COF integration from a single docs
page, unaided? I score each run as a weighted line-item vector — a roll-up in [0,1] — plus a binary
`full_pass`. The vector isn't decoration. The metric has two readers with opposite needs: the docs-editor
wants a dense gradient to know which gap to close next; the scorecard wants an honest headline on whether
the thing actually works. A bare pass/fail starves the loop — clear three of seven checks and it still
reads as zero, so the editor learns nothing.

Two rules keep a composite score honest. Gating encodes dependency; weight encodes importance. The four
items the documented chain depends on — boots, ZA renders, `onSuccess`+paymentId, the correct COF
reference — are gating. Robustness (graceful 410, device id, auth) is additive and weighted, not free.
The second rule: the roll-up is the gradient, not the gate. An edit lands only if it regresses no gating
item, so the number can't climb while the core flow breaks. `full_pass` is every gating item green.

Underneath both is the rule I care about most: the oracle and the docs need independent sources of truth.
The mock is pinned to Coinflow's real contract; the docs are the mutable artifact. Let one derive from the
other and the loss goes circular — a wrong doc yields a wrong-in-the-same-way mock that happily passes a
broken integration. Same reason the editor knows ground truth and the implementer never does: I'm testing
the docs, not the editor.

## What I'd build with 10× the time

- A real multi-provider panel at scale — Anthropic, OpenAI, Google, and an open-weight model through the
  OpenAI-compatible adapter, N≥5, with confidence intervals and a significance test on before/after so I'm
  optimizing signal, not noise.
- Harder gaps. Today's worked example is a missing-fact gap. The gap that matters more is agent-legibility:
  the fact is on the page but buried, mis-ordered, or ambiguously named. That needs a broader failure
  taxonomy and the one place an LLM-judge earns its seat — "did the agent have to ask a clarifying question
  it shouldn't have needed?"
- A real-model editor instead of the deterministic remediation mapper — same length budget, a
  no-model-specific-hacks check, human diff review, and auto-promotion of recurring unclassified mock
  rejections into named line-items.
- Whole-docs-site scope and higher mock fidelity: a cross-origin iframe for the PCI boundary, the full
  velocity config (period/expiration behind a clock hook), the 3DS and token paths.

## Where it's brittle

I'll lead with the limits, because they're the interesting part.

- The mock is only as faithful as the contract I encoded. Anything I didn't model won't get caught
  offline. I mitigate two ways: pin the stub from the real published package, and run a periodic live
  probe. I ran that probe once (`pnpm probe`). The live sandbox confirmed the COF endpoint, the
  `originalPaymentId` field, and the 410 semantics — and caught two things I'd gotten wrong. A missing
  reference returns `410`, not the `404` I'd modeled (pinned), and real auth is the merchant key plus
  `x-coinflow-auth-user-id`, which I promoted to the `cof_auth` line-item (rubric v2). Discovery→promotion,
  end to end. See `docs/worked-example/live-sandbox-probe.md`.
- A deterministic mock provider proves the machinery, not that real agents benefit. The live Claude run
  (0.70→1.00) is real evidence, but it's one model on one page. Generalization comes from the panel and the
  held-out model, run live.
- The optimization panel's failure distribution has to match reality, or I fix the wrong gaps. The proof is
  uncomfortable: the offline loop took Claude 0.70→1.00 but left GPT-4o at 0.50→0.50. GPT learned the 410
  and device edits from v1, then kept hallucinating the COF endpoint — a failure the mock never produces, so
  the editor never targeted it. The fix is real, diverse models in the panel, not just the holdout. The mock
  is for CI and machinery; it doesn't tell me which gaps matter.
- The verifier only sees what's in the rubric. "Passes but subtly wrong in production" is a real risk; my
  answer is a growing rubric — discovery automatic, promotion curated — plus the live cadence, not a claim of
  completeness.
- Browser and timing flakiness (iframe `postMessage`, port collisions) is bounded with ephemeral per-run
  state, auto-waiting locators, and fixed test ids the shell owns so the agent can't break them.
- The verifier boots the app in-process, not in a container. Vite and the integration's Express run as
  ephemeral in-process servers — hermetic enough for the mock, faster, simplest in CI. The spec names a
  container; a Dockerfile around `make eval` is the productionization step, and the boot/drive logic is
  unchanged. I'm calling it out so the deviation is owned, not dropped.

## Cost, latency, and flakiness — the honest numbers

- Offline (`make eval`): deterministic, no API cost, spread 0. A thorough run is ~2 panel passes × 3 mock
  readers × one browser verify each — tens of seconds on a laptop. This is the CI path.
- Live: one implementer run is a 2–3 step tool-use loop, ~16k in / ~2k out tokens on Opus 4.8 — cents. A
  full live panel is `N × models × iterations`, so I budget it deliberately; latency is the model and the
  browser, not my code.
- Determinism caveat: Opus 4.8 deprecates `temperature` (it 400s), so I can't pin it there. That's exactly
  why the harness reports variance across N runs instead of assuming determinism — the model-agnostic layer
  has to absorb this kind of per-provider drift.

## Wiring it into CI

- On every PR touching `docs/`, `src/`, `scaffold/`, or the SDK version (the real `@coinflow/react` is
  stubbed in mock; live mode pins it as a dep): run `typecheck` + `smoke` + a golden-fixture verify +
  `make eval` on the mock panel, no secrets, and post the before/after scorecard as a PR comment. Fail the
  gate if the `full_pass` rate drops or any gating line-item regresses. Cheap, deterministic, secret-free.
- On a schedule and on each SDK release: run the live panel (Anthropic + OpenAI + a held-out model) with CI
  secrets, re-baseline the rubric, and open an issue when a model regresses the page. That's my answer to "a
  new frontier model regressed the docs next quarter."
- Comparability: every score carries `rubric_version`. Adding a line-item bumps the version and forces a
  re-baseline, so I never compare before/after across a changed rubric — the same discipline as never
  comparing accuracy across two different test sets.
