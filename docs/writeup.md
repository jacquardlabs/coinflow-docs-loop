# Writeup — self-improving, model-agnostic docs

## The metric, and why

The loss function is: **can an autonomous agent ship a working ZA→COF integration from one docs
page alone?** A single run scores a **weighted line-item vector → roll-up ∈ [0,1]**, plus a binary
`full_pass`. The vector matters because the metric has two consumers: the docs-editor needs a *dense
gradient* to know which gap to target, and the scorecard needs an *honest headline* to know whether
the integration actually works. A bare pass/fail starves the loop — a fix that moves three of six
assertions shows zero.

Two rules keep a composite score safe. **Gating encodes dependency, weight encodes importance:** the
four line-items the documented chain depends on (boots, ZA renders, `onSuccess`+paymentId, correct
COF reference) are gating; robustness (graceful 410, device id) is additive and heavily weighted, not
cheap. And **the roll-up is the gradient, not the gate** — an edit is accepted only if it regresses no
gating item, so the number can never climb while the core flow breaks. `full_pass` = all gating green.

The integrity rule underneath everything: **the oracle and the docs have independent sources of
truth.** The mock is pinned to Coinflow's real contract; the docs are the mutable artifact. If either
derived from the other the loss would be circular — a wrong doc would produce a wrong-in-the-same-way
mock that passes broken integrations. Likewise the **editor knows ground truth; the implementer never
does** — we are testing the docs, not the editor.

## What I'd do with 10× the time

- **A real multi-provider panel at scale** — Anthropic + OpenAI + Google + an open-weight model via the
  OpenAI-compatible adapter, N≥5, with confidence intervals and significance tests on before/after so
  we optimize signal, not noise.
- **Harder gap classes.** Today the worked example is a *missing-fact* gap. The richer, more common gap
  is *agent-legibility*: the fact is present but buried, mis-ordered, or ambiguously named. That needs a
  broader failure taxonomy and the one place an LLM-judge earns its seat — "did the agent have to ask a
  clarifying question it shouldn't have needed?"
- **A real-model editor** (not the deterministic remediation mapper), fenced by the same length budget,
  a no-model-specific-hacks check, and human diff review — plus auto-promotion of recurring *unclassified*
  mock rejections into named rubric line-items.
- **Whole-docs-site scope and higher mock fidelity** — cross-origin iframe (PCI boundary), the full
  velocity config (period/expiration behind a clock hook), 3DS and token paths.

## Where it's brittle

- **The mock is only as faithful as its encoded contract.** Behaviors we didn't model won't be caught
  offline. Mitigations: pin the stub from the real published package + a periodic live-validation pass;
  keep the mock's request log so novel failures surface for promotion. *Run once (`pnpm probe`):* the live
  sandbox confirmed the COF endpoint + `originalPaymentId` field + 410 semantics, and surfaced two things
  the mock omitted — a missing reference returns `410` (we'd modeled `404`, now pinned) and real auth is
  the merchant key **+ `x-coinflow-auth-user-id`** (the next line-item to promote). See
  `docs/worked-example/live-sandbox-probe.md`.
- **A deterministic mock provider proves the machinery, not that real agents benefit.** The live Claude
  run (0.70→1.00) is real evidence, but it is one model on one page. Generalization comes from the panel
  and the held-out model, run live.
- **Browser/timing flakiness** (iframe `postMessage`, port collisions) — bounded with ephemeral per-run
  state, auto-waiting locators, and fixed test ids owned by the fixed shell (the agent can't break them).
- **The verifier only sees what's in the rubric.** "Passes but subtly wrong in production" is real; the
  answer is a *growing* rubric (discovery automatic, promotion curated) + live cadence, not a claim of
  completeness.
- **The optimization panel's failure distribution must match reality — or you fix the wrong gaps.** Live
  proof: the offline mock loop took Claude 0.70→1.00 but left GPT-4o at 0.50→0.50. GPT *learned* the
  410/device edits from v1 yet keeps hallucinating the COF endpoint — a gap the mock never exhibits, so the
  editor never targeted it. Mitigation: put real, diverse models *in* the panel (not just the holdout); the
  mock is for CI and machinery, not for discovering which gaps matter.

## Cost, latency, flakiness — honest numbers

- **Offline (`make eval`)**: fully deterministic, no API cost, spread 0. A thorough run is ~2 panel
  passes × 3 mock readers × one browser verify each — tens of seconds on a laptop. This is the CI path.
- **Live**: one implementer run is a 2–3 step tool-use loop, ~16k in / ~2k out tokens on Opus 4.8 —
  cents. A full live panel is `N × models × iterations`, so budget deliberately; latency is dominated by
  the model and the browser, not our code.
- **Determinism caveat**: Opus 4.8 *deprecates* `temperature` (it 400s), so we can't pin it there — which
  is exactly why the harness reports variance across N runs rather than assuming determinism. The
  model-agnostic layer has to absorb this kind of per-provider API drift.

## Wiring into CI to gate doc and SDK changes

- **On every PR** touching `docs/`, `src/`, `scaffold/`, or the pinned SDK version: run `typecheck` +
  `smoke` + a golden-fixture verify + `make eval` on the **mock panel** (no secrets), and post the
  before/after scorecard as a PR comment. **Fail the gate** if `full_pass` rate drops or any gating
  line-item regresses. This is cheap, deterministic, and secret-free.
- **On a schedule and on each SDK release**: run the **live** panel (Anthropic + OpenAI + a held-out
  model) via CI secrets, re-baseline the rubric, and open an issue when a model regresses the page — the
  answer to "a new frontier model regressed the docs next quarter."
- **Comparability**: every score carries `rubric_version`; adding a line-item bumps the version and forces
  a re-baseline, so before/after is never compared across a changed rubric — the same discipline as never
  comparing accuracy across two different test sets.
