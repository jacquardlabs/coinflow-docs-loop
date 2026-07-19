.PHONY: eval mock smoke verify implement panel typecheck

eval:        ## run the full panel -> edit -> panel loop; drop scorecard + diff in artifacts/eval/
	pnpm eval

mock:        ## boot the mock Coinflow oracle
	pnpm mock

smoke:       ## prove the oracle's deterministic core (no browser)
	pnpm smoke

verify:      ## verify one integration fixture (default: golden-good)
	pnpm verify

implement:   ## one implementer run (default: mock + v0 docs)
	pnpm implement

panel:       ## score a docs version across the panel + holdout
	pnpm panel

typecheck:   ## type-check the whole repo
	pnpm typecheck
