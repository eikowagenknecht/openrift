---
status: accepted
date: 2026-09-07
---

# ADR-046: Layered Module Layout with Lint-Enforced Import Direction

## Context and Problem Statement

The web app is organised by technical layer (`lib`, `stores`, `hooks`, `components`, `routes`) and the API by `repositories`, `lib`, `services`, `routes`. Nothing enforced the direction between them. By 2026-09, `lib` modules imported component types, hooks imported route files, routes imported repository helpers, and `@openrift/shared` was reached through a 329-line barrel that pulled every module into one chunk. A directory name no longer said what a module could depend on, which blocked reorganising the web app by feature. Which import directions are allowed, and what holds them?

## Decision Drivers

- A module's directory must tell the reader what it may depend on.
- The rule has to survive 350 to 450 commits a month, so it must fail a commit, not a review.
- The planned feature-folder move needs every module's dependencies to point downward first.
- Type imports are erased at runtime but still define the graph, so they count.

## Considered Options

- Document the layers and rely on review
- Enforce with per-directory `no-restricted-imports` overrides in oxlint
- Adopt a dependency-graph tool with its own config

## Decision Outcome

Chosen option: "Enforce with per-directory `no-restricted-imports` overrides in oxlint", because oxlint already runs on every staged file and the whole rule set is a handful of overrides in the existing config, with no new tool to install or teach.

Web: `lib` < `stores` < `hooks` < `components` < `routes`. API: `db` < `repositories` < `lib` < `services` < `routes`, where `lib` and `repositories` may import each other and routes may import repository types. API test files are exempt so integration tests can seed through repository modules. `@openrift/shared` has no barrel; every import names the leaf module through the package's `./*` export pattern.

### Consequences

- Good, because a violation fails pre-commit with a message that names the layer to move the definition to.
- Good, because a component reaches a route through `getRouteApi()` and a hook never imports a component, so either can move into a feature folder without dragging the other along.
- Good, because deleting the shared barrel removed 1,900 imports that each pulled 77 modules into the consumer's chunk.
- Bad, because the API `lib` and `repositories` edge was two-way when this was decided, which the lint cannot tell from a cycle. Amended 2026-09-08: the top-level `src/lib/` became the pure bottom layer every layer may import, row types moved to the repositories that produce them, and a repository may no longer import a module's `lib/`; the edge is one-way and enforced.
- Bad, because the base rule's `../*` pattern matches a single path segment, so a two-level relative parent import is not caught; the web app uses the `@/` alias everywhere and the API has its own config, so the gap is dormant.

### Confirmation

`bunx oxlint apps/web/src apps/api/src` reports no `no-restricted-imports` findings, and the pre-commit hook runs the same check on every staged file.

## More Information

The per-layer rules and what belongs in each directory are in `docs/contributing.md` under "Web module layout", "API module layout" and "Shared package imports". The feature-folder reorganisation this prepares for will get its own record.
