# API Coverage Findings

## [image-rehost.ts] — Module-level error paths are unreachable in tests

**Observed:** Lines 34 and 41 in `findProjectRoot()` throw errors when `import.meta.dirname` is unavailable (line 34) or when no `bun.lock` file is found walking up the directory tree (line 41). These execute at module import time before any test can run.
**Expected:** Defensive throws that protect against broken runtime environments — reasonable to leave uncovered.
**Evidence:** Both lines execute during ES module evaluation. By the time vitest loads the test file, the module has already resolved successfully.
**Severity:** low

## [tcgplayer.ts] — Defensive continue guard is structurally unreachable

**Observed:** Line 125 in `buildTcgplayerStaging` has a `continue` guard for when `productPricesMap` doesn't contain an entry for a productId. However, `fetchTcgplayerData` always populates both `productsMap` and `productPricesMap` from the same API response, making this condition impossible to trigger.
**Expected:** The guard is defensive — if the upstream fetch logic ever changes, it would catch the inconsistency.
**Evidence:** `fetchTcgplayerData` builds both maps from the same `products` array; every productId in `productsMap` also exists in `productPricesMap`.
**Severity:** low

## [upsert.ts] — Defensive continue guard is structurally unreachable

**Observed:** Line 131 in `upsertPriceData` has a `continue` guard for when `productIdLookup` doesn't contain a `printingId`. Both `productIdLookup` and `printingByExtIdFinish` are built from the identical `dbProducts` array, making this condition impossible.
**Expected:** Defensive code — safe to leave in place.
**Evidence:** Both maps are populated by iterating `dbProducts` in the same function; a printingId present in one is guaranteed to be in the other.
**Severity:** low
