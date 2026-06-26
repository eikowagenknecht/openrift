# oRPC migration review — deferred follow-ups

All HIGH/MEDIUM findings from the branch review were fixed (see the oRPC review
in the session). The items below were **deliberately deferred** — each is either
low-value cosmetic churn, a defensive test for a hypothetical future mistake, or
not verifiable from a worktree. None is a current correctness or security bug.

## Test coverage

- **`Vary: Cookie` wiring test.** The catch-all sets `Vary: Cookie` (via
  `loadSession`) on the two optional-auth public reads (`/api/v1/feature-flags`,
  `/api/v1/users/share/*`). There is no existing public optional-auth
  _integration_ test to extend, and integration tests can't run from a worktree,
  so a new (unrunnable-here) test file was higher risk than value. The ETag/304
  conditional-GET wiring is now covered in `catalog.integration.test.ts`; only
  the `Vary: Cookie` assertion remains uncovered.
  - _Suggested:_ add an integration test that GETs `/api/v1/feature-flags`
    anonymously and asserts `res.headers.get("Vary")` contains `Cookie`.

- **Optional-auth coupling guard.** `requireUser`'s public branch never resolves
  a user, so a `meta:{auth:"public"}` procedure only sees `context.user` if its
  path also has an explicit `app.use(path, loadSession)`. Exactly the two
  optional-auth routes have it today (correct), but a _future_ public route that
  reads the viewer without that line would silently treat a signed-in user as
  anonymous (no error). Worth a test asserting every viewer-reading public route
  is in the `loadSession` allowlist. Not a current bug.

## Test consistency (cosmetic)

- **Half-migrated test mounts.** Commit `75b96966` introduced
  `registerRouterForTest`, but only ~23 of ~71 route test files use it; ~48 still
  hand-roll `new OpenAPIHandler(...)`. Functionally equivalent. The one real
  divergence (the `user-share`/`pod-tournaments` test handlers missing
  `appErrorInterceptor`) was already fixed. Bulk-converting the rest is large,
  low-value churn.

## Contract / naming cleanup (cosmetic, carried-over churn)

- **Duplicated `marketplaceEnum`** (`["tcgplayer","cardmarket","cardtrader"]`)
  is re-inlined in `staging-card-overrides.ts`, `unified-mappings.ts`,
  `ignored-products.ts`, `operations.ts`. A shared `marketplaceEnum` /
  `ALL_MARKETPLACES` already exists in `packages/shared/src/schemas.ts`. This
  duplication pre-existed the migration; consolidating it is a contracts-wide
  refactor with drift risk.
- **Duplicated `slugRegex`** local const in `markers.ts`,
  `distribution-channels.ts`, `custom-tags.ts` (identical kebab-case regex).
  Could be centralised, but there's no obvious contract-only home.
- **Duplicated job-kickoff response shape** (`{ runId: uuid, status: enum }`)
  under three names: `operations.ts` `jobRunStartedResponseSchema`, `images.ts`
  `jobKickoffSchema`, `printing-events.ts` `flushStartedResponseSchema`.
- **`cards/mutations-orpc.ts` filename** still carries the `-orpc` suffix that
  disambiguated it from the now-deleted `mutations.ts`. Renaming to
  `mutations.ts` (updating the `router.ts` + test imports) is purely cosmetic.

## Notes

- These fixes correct regressions introduced _within this unreleased migration
  branch_, so no `CHANGELOG.md` entry is warranted (users never saw the broken
  behaviour).
