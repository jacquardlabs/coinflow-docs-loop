.PHONY: mock smoke typecheck

mock:        ## boot the mock Coinflow oracle
	pnpm mock

smoke:       ## prove the oracle's deterministic core (no browser)
	pnpm smoke

typecheck:   ## type-check the whole repo
	pnpm typecheck
