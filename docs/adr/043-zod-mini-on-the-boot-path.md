---
status: proposed
date: 2026-08-30
---

# ADR-043: zod/mini on the Boot Path, Classic zod Everywhere Else

## Context and Problem Statement

Every non-lazy file under `apps/web/src/routes/` is loaded on the first page view, so anything it imports at value level lands in the boot chunk. Thirty-five of them declare `validateSearch`, and the schemas behind it are built at module scope. That puts classic zod, and the construction of every search schema, on the critical path: 65 KB minified (17.5 KB gzipped) of library code and 97 ms of module-scope work before the first route renders.

Classic zod does not shrink when a file uses less of it. `zod/v4/classic/external.js` calls `config(en())` at module scope and re-exports several namespaces, which defeats tree-shaking: the boot chunk measures the same 65 KB whether the schemas use five node types or thirty.

zod 4 ships `zod/mini`, a tree-shakeable functional API built on the same `zod/v4/core`. It drops method chaining in favour of top-level functions, so `s.optional().catch(undefined)` becomes `z.catch(z.optional(s), undefined)`. 150 non-test files import zod, of which 132 are the oRPC contracts in `packages/shared`. Migrating all of them is roughly 3,350 mechanical call-site rewrites.

## Considered Options

- Keep classic zod everywhere
- Migrate every zod module to zod/mini
- Migrate only the modules reachable from non-lazy route files
- Keep classic zod and replace chained refinements with `.check()`

## Decision Outcome

We migrate only the modules reachable from non-lazy route files and leave the remaining ~136 on classic. The bundle cost is per-chunk, not per-repo, so the boot-path win does not require the contracts to move. Mini and classic build the same `zod/v4/core` instances and nest inside each other in both directions, and `z.infer` / `z.input` resolve identically across the two, so the boundary needs no adapter and no consumer of `FilterSearch` changes.

Measured on the real boot-path feature set (object, string, number, boolean, array, enum, `.optional()`, `.catch(undefined)`, `.omit()`, `.extend()`), bundled with rolldown 1.2.6 and minified:

|         | minified | gzipped |
| ------- | -------- | ------- |
| classic | 65.2 KB  | 17.5 KB |
| mini    | 14.2 KB  | 4.8 KB  |

Constructing 5,000 copies of that schema group under Bun takes ~460 ms on classic and ~215 ms on mini. The gap is structural rather than incidental: zod's `$constructor` assigns methods per instance rather than per prototype, classic's `ZodType` init assigns 16 of them plus per-type extras against mini's 12 total, and every chained call clones the schema.

The migration set is 16 files:

- `apps/web/src/lib/`: `search-schemas.ts`, `cards-search-schema.ts`, `deck-list-search.ts`, `presentation-queue-search.ts`, `meta-deck-search.ts`
- `packages/shared/src/types/`: `search.ts`, `list-rule.ts`, `pricing.ts`
- the eight non-lazy route files that build a schema inline rather than importing one

The three `packages/shared/src/types/` modules are in scope because the package root barrel re-exports them. Every `types/api/*.ts` uses `import type { z }` and erases at build, and the barrel does not re-export `contracts` or `response-schemas`, so no contract reaches the boot chunk today.

### Consequences

- Good, because the boot chunk drops ~51 KB minified (~12.7 KB gzipped) and roughly half the 97 ms of module-scope schema construction, against ~96 call-site rewrites concentrated in six factory helpers in `search-schemas.ts`.
- Good, because the contracts, the OpenAPI generator, and the API error handler are untouched. `@orpc/zod/zod4`'s converter reads `_zod.def` at the core level and mini exposes `~standard` with vendor `zod`, so oRPC and TanStack Router accept either dialect.
- Neutral, because `cleanedSearchForRedirect` is typed `schema: z.ZodType<Output>` and has to widen to `core.$ZodType<Output>`, which leaves `search-schemas.ts` importing from both `zod/mini` and `zod/v4/core`.
- Bad, because the repo carries two zod dialects permanently, with no compiler signal at the boundary. A line copied from a contract into a migrated file does not work, and the reverse silently costs 65 KB.
- Bad, because the saving is silent to lose. A future value-import of any classic-zod module from a non-lazy route restores the full 65 KB with no error, no warning, and no failing test.
- Bad, because the set is defined by which route files are lazy, which moves. Splitting a route differently later can pull a file in or out of scope without anyone noticing.
- Bad, because `z.catch(z.optional(z.array(z.string())), undefined)` reads inside-out, and the migrated files are the ones densest in exactly that chain.

### Confirmation

A build assertion fails the build if any classic zod module reaches the boot chunk. Without it the decision decays on the first unrelated import and nothing reports it. `apps/web/vite.config.ts` already throws at `buildEnd` for React Compiler bailouts, so the check belongs beside that one.

## Pros and Cons of the Options

### Keep classic zod everywhere

- Good, because one dialect, no boundary to police, and no build assertion to maintain.
- Bad, because the 65 KB is a fixed floor that no amount of narrowing the schemas will move.

### Migrate every zod module to zod/mini

- Good, because one dialect again, with no boundary and no assertion needed.
- Good, because the API server's schema construction gets the same halving, though nothing there is latency-sensitive enough to care.
- Neutral, because it is mechanical rather than hard. Every classic method has a top-level mini equivalent, and `.shape` still works on mini objects.
- Bad, because it is ~3,350 call-site rewrites across ~20,000 lines for no gain beyond what the 16-file set already delivers.
- Bad, because `.meta()` is used 49 times across the contracts for OpenAPI descriptions and has no mini equivalent, so each becomes `.register(z.globalRegistry, {...})`.
- Bad, because `apps/api/src/app.ts:127` tests `err instanceof z.ZodError`, and a mini schema throws core `$ZodError`, which does not match. Validation errors would fall through to the generic handler with nothing reporting it.

### Migrate only the modules reachable from non-lazy route files

- Good, because it captures the entire measured win at ~3% of the rewrite volume.
- Bad, because of the permanent two-dialect boundary and its decay risk, covered under Consequences.

### Keep classic zod and replace chained refinements with `.check()`

Chaining clones the schema on every call, so `.min(1).max(200).trim()` builds three instances where `.check(z.minLength(1), z.maxLength(200), z.trim())` builds one.

- Good, because it needs no new dependency surface, no boundary, and no assertion.
- Good, because it cuts construction from ~460 ms to ~370 ms on the benchmark above, about 20% of the win, and composes with the chosen option.
- Bad, because it does nothing for bundle size, which is the larger half of the problem.

## More Information

Three behaviours differ from classic and are worth pinning down before the migration:

- Mini configures no locale. Classic's `external.js` runs `config(en())` at module scope and mini's does not, so a mini-only chunk reports every issue as `"Invalid input"`. Calling `z.config(en())` restores the messages and gives back ~4.8 KB of the saving. The search-param schemas swallow every error through `.catch(undefined)` and show no message, so the migration set can skip it, but anything migrated later cannot.
- `z.ZodIssueCode` is undefined in mini. `packages/shared/src/contracts/prices.ts` uses it three times, which is one more reason the contracts stay on classic. `z.NEVER` does exist.
- Mini `.parse()` throws core `$ZodError`, not classic `ZodError`. Nothing in the migration set is caught by `apps/api/src/app.ts:127`, but that check should widen to `core.$ZodError` regardless, since it catches both.

Type parity was verified with tsc rather than assumed: for a representative search schema, `z.infer` and `z.input` produce mutually assignable types across both dialects, which is what keeps the ~1,250 `@openrift/shared` consumers out of scope.

Measurements are reproducible with rolldown 1.2.6 for size (`bun build` tree-shakes classic far worse and overstates the gap at 283 KB) and Bun for construction time.
