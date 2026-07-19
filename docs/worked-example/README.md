# Worked example — moving a real docs page

The loop was pointed at Coinflow's **actual** Zero Authorization page (`docs/za-guide.v0.md`,
fetched from `…/zero-authorization.md`). That page teaches the ZA→COF happy path but never
mentions the `410`/velocity failure path or the nSure device id — those live only on the
sibling Card-on-File page, which the implementer never sees.

## Result

| reader | role | v0 (as-is) | v1 (editor-optimized) |
|---|---|---|---|
| mock-lenient | panel | 0.70 | 1.00 |
| mock-careful | panel | 0.70 | 1.00 |
| mock-literal | **holdout** | 0.70 | 1.00 |
| **Claude Opus 4.8** | **live** | **0.70** | **1.00** |

- **Panel mean 0.70 → 1.00**, and the improvement **generalized to the held-out model** (`eval-thorough.summary.md`).
- **Live confirmation:** real Claude, reading only the docs, scored the *same* 0.70 on v0 (`unhandled_410` + `missing_nsure_device_id`) and **1.00** on the editor's v1 — the offline loop's edits measurably improved a live frontier model (`live-claude-v0.scorecard.json`, `live-claude-v1.scorecard.json`).
- **The edit was targeted and small:** three appended sections (410 handling, COF auth, device id), doc grew 505 → 558 lines, inside the ≤20% budget (`v0-to-v1.diff.txt`).

## Why the holdout earns its keep

The **prose-only** editor run (`eval-prose-only.summary.md`) makes the anti-overfitting case
concrete: adding the guidance as prose *without a code example* lifts the panel to 0.93 but
leaves the strict held-out reader stuck at **0.70**. Prose satisfies the easy readers; the
holdout only moves once the doc carries an actual code example. That gap is the overfitting a
held-out model exists to catch — and the thorough editor clears it.

## Files

| file | what |
|---|---|
| `eval-thorough.summary.md` | before/after, thorough editor (the primary result) |
| `eval-prose-only.summary.md` | before/after, prose-only editor (holdout catches overfit) |
| `v0-to-v1.diff.txt` | the exact edits the editor made (append-only, budgeted) |
| `live-claude-v0.scorecard.json` | live Claude on the as-is page → 0.70 |
| `live-claude-v1.scorecard.json` | live Claude on the optimized page → 1.00 |

Regenerate everything with `make eval` (offline) or `pnpm implement claude za-guide.v1` (live, with keys in `.env` or the environment).

## Two real models diverge — the mock panel's blind spot

| model | v0 | v1 | what happened |
|---|---|---|---|
| Claude Opus 4.8 | 0.70 | **1.00** | learned 410 + device id from v1; full pass |
| GPT-4o | 0.50 | **0.50** | *also* learned 410 + device id from v1 — but hallucinates the COF endpoint, which cascades |

GPT read v1 and correctly added the `410` branch and the `x-device-id` header — yet it still POSTs to a
**made-up endpoint** (`/api/checkout/merchant-initiated-transaction`), so a 404 (not 410) comes back, the
410 branch never fires, the device header never reaches a real COF call, and all three COF-dependent
line-items fail at once (`live-gpt-v0.scorecard.json`, `live-gpt-v1.scorecard.json`).

Its dominant gap — endpoint hallucination — was **never in the mock panel's failure distribution** (the
mock always uses the right endpoint), so the editor never targeted `cof_correct_ref` and the doc's
endpoint guidance stayed too weak for GPT. **Lesson: optimizing against a narrow/mock panel closes the
gaps that panel shows, not the gaps a different real model has. Put real, diverse models *in* the panel,
not just the holdout — the mock is for machinery and CI, not for discovering which gaps matter.**
