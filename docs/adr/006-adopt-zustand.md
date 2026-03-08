---
status: accepted
date: 2026-03-08
---

# ADR-006: Adopt Zustand for Client-Side State Management

## Context and Problem Statement

The web app manages client-side state through several independent mechanisms: a hand-rolled `DisplaySettingsContext` backed by four `useLocalStorage` calls, separate `useTheme` and `useSearchScope` hooks each with their own localStorage persistence, URL-synced filter state via `nuqs`, server state via React Query, and browser API subscriptions via `useSyncExternalStore`. The `CardBrowser` component passes ~25 props to `FilterBar` and ~12 to `CardGrid`, partly because display settings flow as props despite being available via context. Should we adopt Zustand to consolidate client-side state and reduce boilerplate?

## Decision Drivers

- The `DisplaySettingsContext` in `__root.tsx` requires ~50 lines of boilerplate: `createContext`, null-check in `useDisplaySettings`, a provider wrapper, and four `useLocalStorage` calls with custom serializers/deserializers
- Three separate localStorage-backed hooks (`useLocalStorage` for display settings, `useTheme`, `useSearchScope`) each implement their own persistence logic
- `CardBrowser` is a prop-drilling bottleneck — it threads display settings, filter state, and callbacks through 4–5 child components
- React Compiler is enabled, so `useMemo`/`useCallback` are not concerns, but provider nesting and context re-renders still apply

## Considered Options

- Adopt Zustand for user preferences (display settings, theme, search scope)
- Adopt Jotai for user preferences
- Adopt Zustand broadly for all non-server, non-URL state
- Keep the current approach

## Decision Outcome

Adopt Zustand for user preferences, with three separate stores: `useThemeStore` (app-wide theme), `useDisplayStore` (card browser display settings), and `useSearchScopeStore` (search field scope).

### Consequences

- Good, because the `DisplaySettingsContext` provider, `createContext`, and `useContext` null-check are replaced by a single `useDisplayStore` hook — any component can read settings without provider nesting.
- Good, because Zustand's `persist` middleware replaces the four manual `useLocalStorage` calls and their custom serializers with a declarative `partialize` config.
- Good, because child components (`CardGrid`, `CardThumbnail`, `FilterBar`) can read display settings directly from the store, removing ~8 props from `CardBrowser`'s pass-through surface.
- Good, because theme and search scope each get their own small store (or share one), giving a single pattern for all persisted preferences while keeping unrelated domains separate.
- Neutral, because Zustand adds a dependency (~1 KB gzipped, no transitive dependencies).
- Bad, because it introduces a new state management pattern alongside the existing ones (React Query, nuqs, useSyncExternalStore), increasing the number of concepts a contributor must know.

## Pros and Cons of the Options

### Adopt Zustand for user preferences

Scope: replace `DisplaySettingsContext` + `useLocalStorage` with a `useDisplayStore`. Theme gets a separate `useThemeStore` (it's app-wide, not card-browser-specific). Search scope can live in its own store or alongside display settings.

- Good, because it eliminates the context provider from `__root.tsx`, reducing component nesting depth.
- Good, because `persist` middleware handles localStorage serialization, storage events, and hydration out of the box — replacing ~80 lines of custom `useLocalStorage` logic.
- Good, because components can subscribe to individual slices (e.g., `useDisplayStore(s => s.showImages)`), avoiding re-renders when unrelated settings change — an improvement over the current context which re-renders all consumers on any setting change.
- Neutral, because the migration is small (~2–3 files changed) and can be done incrementally.
- Bad, because the current approach works and the improvement is ergonomic, not functional.

### Adopt Jotai for user preferences

Scope: same as the Zustand option — replace `DisplaySettingsContext`, theme, and search scope — but using Jotai's atomic model instead of Zustand's store model.

- Good, because Jotai's atomic model (`atom()` + `useAtom()`) feels closer to `useState`, which may be more intuitive for contributors already familiar with React primitives.
- Good, because `atomWithStorage` provides built-in localStorage persistence per atom, similar to Zustand's `persist`.
- Good, because each setting is an independent atom, so components naturally subscribe only to what they read — no selector functions needed.
- Neutral, because bundle size is comparable (~1 KB gzipped, no transitive dependencies).
- Bad, because the current state is naturally grouped (display settings are a cohesive unit of 4 fields that change together in a settings panel). Jotai would scatter this into four independent atoms (`showImagesAtom`, `richEffectsAtom`, `cardFieldsAtom`, `maxColumnsAtom`) with no structural grouping — the "these belong together" relationship only exists by convention (e.g., a shared file).
- Bad, because actions that update multiple settings at once (e.g., "reset display settings to defaults") require updating each atom individually or introducing a derived/writable atom, whereas Zustand handles this with a single `set()` call.
- Bad, because Jotai needs a `<Provider>` for test isolation (to avoid shared global state between tests), while Zustand stores can be trivially recreated.

**Why Zustand over Jotai for this use case:** The existing `DisplaySettingsContext` is already a grouped bag of related settings with a single provider. Zustand's store model maps 1:1 to this pattern — it's a like-for-like replacement with less boilerplate. Jotai's strength is composing fine-grained, independent atoms with derived state — a pattern we don't need here.

### Adopt Zustand broadly

Scope: also move `selectedCard`/`detailOpen` from `CardBrowser` useState, and potentially SW update state.

- Good, because it would further reduce `CardBrowser`'s local state and prop surface.
- Bad, because `selectedCard`/`detailOpen` are genuinely local to the card browser flow — putting them in a global store makes the scope of state changes harder to reason about.
- Bad, because SW update state has a single consumer (`ReloadPrompt`) and gains nothing from a store.
- Bad, because it over-applies a tool to state that is correctly scoped as component-local.

### Keep the current approach

- Good, because the existing architecture is already well-layered: React Query for server state, nuqs for URL state, useSyncExternalStore for browser APIs, useState for local UI.
- Good, because no new dependency or pattern is introduced.
- Bad, because the `DisplaySettingsContext` boilerplate remains, and adding new persisted preferences requires duplicating the `useLocalStorage` + context pattern.
- Bad, because all context consumers re-render on any setting change, with no slice-level subscription.

## More Information

### Current state inventory

| State category                                                     | Current mechanism                            | Zustand candidate?                                                      |
| ------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------- |
| Display settings (showImages, richEffects, cardFields, maxColumns) | `DisplaySettingsContext` + `useLocalStorage` | Yes — primary target                                                    |
| Theme (light/dark)                                                 | `useTheme` + localStorage                    | Yes — own `useThemeStore` (app-wide, separate domain from card display) |
| Search scope (searchable fields)                                   | `useSearchScope` + localStorage              | Yes — own store or alongside display settings                           |
| Card filters (20+ params)                                          | `nuqs` (URL query params)                    | No — URL sync is the purpose                                            |
| Server data (cards, prices)                                        | React Query                                  | No — purpose-built for server state                                     |
| Browser APIs (gyroscope, online status)                            | `useSyncExternalStore`                       | No — already idiomatic                                                  |
| Selected card / detail panel                                       | `useState` in `CardBrowser`                  | No — correctly scoped as local                                          |
| Grid layout (column counts)                                        | `useState` in `CardBrowser`                  | No — derived from ResizeObserver                                        |
| SW update state                                                    | `SWUpdateContext`                            | No — single consumer                                                    |

### Store boundaries

Theme and display settings are separate domains despite both being "user preferences":

| Store             | State                                                   | Scope                                                        |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `useThemeStore`   | `theme`, `setTheme`                                     | App-wide — affects layout shell, every themed component      |
| `useDisplayStore` | `showImages`, `richEffects`, `cardFields`, `maxColumns` | Card browser — affects `CardGrid`, `CardDetail`, `FilterBar` |

Grouping by organizational category ("preferences") rather than by domain would couple unrelated consumers. A theme toggle shouldn't trigger selectors in card grid components, and card display settings shouldn't live in a global theme store.

### Prop drilling reduction

`CardBrowser` currently passes these display-related props that children could read from a store directly:

- `showImages` → `CardGrid`, `CardThumbnail`
- `cardFields` → `CardGrid`, `CardThumbnail`
- `maxColumns` → `CardGrid` (via `useResponsiveColumns`)
- `richEffects` → `CardThumbnail`

Moving these to a Zustand store would let `CardGrid` and `CardThumbnail` subscribe directly, removing ~8 props from the `CardBrowser` → child chain.
