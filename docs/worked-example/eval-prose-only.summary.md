# Eval before/after — mode=prose-only, rubric v2

| model | role | before | after |
|---|---|---|---|
| mock-lenient | panel | 0.70 | 1.00 |
| mock-careful | panel | 0.70 | 0.85 |
| mock-literal | holdout | 0.70 | 0.70 |

- **panel mean:** 0.70 → 0.93
- **holdout mean:** 0.70 → 0.70
- iterations: 1
- edits applied: graceful_410, cof_auth, device_id
- doc length: 505 → 527 lines (budget ≤ 606, within: yes)
