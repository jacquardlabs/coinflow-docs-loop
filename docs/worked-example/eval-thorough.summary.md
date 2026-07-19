# Eval before/after — mode=thorough, rubric v2

| model | role | before | after |
|---|---|---|---|
| mock-lenient | panel | 0.70 | 1.00 |
| mock-careful | panel | 0.70 | 1.00 |
| mock-literal | holdout | 0.70 | 1.00 |

- **panel mean:** 0.70 → 1.00
- **holdout mean:** 0.70 → 1.00
- iterations: 1
- edits applied: graceful_410, cof_auth, device_id
- doc length: 505 → 558 lines (budget ≤ 606, within: yes)
