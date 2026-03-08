# Zustand Evaluation for OpenRift

## Current State Management Inventory

### 1. URL-synced filter state (`nuqs`)

| State | Location | Persistence |
|-------|----------|-------------|
| `search`, `sets`, `rarities`, `types`, `superTypes`, `domains`, `artVariants`, `finishes` | `useCardFilters` hook via `nuqs` | URL query params |
| `energyMin/Max`, `mightMin/Max`, `powerMin/Max`, `priceMin/Max` | `useCardFilters` hook via `nuqs` | URL query params |
| `signed`, `promo` | `useCardFilters` hook via `nuqs` | URL query params |
| `sort`, `sortDir`, `view` | `useCardFilters` hook via `nuqs` | URL query params |

**Zustand verdict: Leave as-is.** URL state must stay in `nuqs` — it's the right tool for shareable, bookmarkable filter URLs. Moving this to Zustand would mean losing URL sync or reimplementing it.

---

### 2. Display settings (React Context + localStorage)

| State | Location | Persistence |
|-------|----------|-------------|
| `showImages` | `DisplaySettingsContext` in `__root.tsx` | localStorage |
| `richEffects` | `DisplaySettingsContext` in `__root.tsx` | localStorage |
| `cardFields` | `DisplaySettingsContext` in `__root.tsx` | localStorage |
| `maxColumns` | `DisplaySettingsContext` in `__root.tsx` | localStorage |

**Zustand verdict: Good candidate.** This is classic "global UI preferences" state. Currently requires a hand-rolled Context + `useLocalStorage` wrapper. With Zustand + its `persist` middleware, this becomes:

- No more `DisplaySettingsContext` boilerplate (provider, `createContext`, `useContext`, null-check)
- No more manual `useLocalStorage` with custom serializers/deserializers
- Any component can `useDisplaySettings()` without being wrapped in a provider
- Built-in `persist` middleware handles localStorage automatically

This would eliminate ~50 lines of context/provider code in `__root.tsx` and the `useLocalStorage` dependency for these settings.

---

### 3. Theme state (localStorage)

| State | Location | Persistence |
|-------|----------|-------------|
| `theme` ("light" / "dark") | `useTheme` hook | localStorage |

**Zustand verdict: Marginal.** The `useTheme` hook is simple and self-contained. Could be folded into a display settings store alongside `showImages`/`richEffects`, but the gain is small since it also needs to manage the DOM class on `<html>`.

---

### 4. Search scope (localStorage)

| State | Location | Persistence |
|-------|----------|-------------|
| `searchScope` (name, cardText, keywords, tags, artist, id) | `useSearchScope` hook | localStorage |

**Zustand verdict: Marginal.** Similar to theme — small, self-contained hook. Could be folded into a settings store for consistency, but minimal standalone benefit.

---

### 5. Card detail / selection state (component-level useState)

| State | Location | Persistence |
|-------|----------|-------------|
| `selectedCard` | `CardBrowser` component | Memory only |
| `detailOpen` | `CardBrowser` component | Memory only |

**Zustand verdict: Possible but not compelling.** This state is scoped to CardBrowser and flows down to CardDetail. It's currently simple — two `useState` calls. Moving it to a store would only help if other distant components needed to know which card is selected (e.g., a keyboard shortcut handler, or a "recently viewed" sidebar). Right now, that's not the case.

---

### 6. Grid layout state (component-level useState)

| State | Location | Persistence |
|-------|----------|-------------|
| `physicalMaxColumns`, `physicalMinColumns`, `autoColumns` | `CardBrowser` component | Memory only |

**Zustand verdict: No benefit.** These are derived from ResizeObserver measurements in `CardGrid` and reported up to `CardBrowser` via callbacks, then passed to `FilterBar` for the column slider. This is transient layout state — Zustand would add indirection with no real gain.

---

### 7. Server state (React Query)

| State | Location | Persistence |
|-------|----------|-------------|
| `allCards`, `setInfoList` | `useCards` hook | Query cache (5 min stale) |
| Price history data | `usePriceHistory` hook | Query cache (10 min stale) |
| Admin data (sets, mappings, etc.) | Various admin hooks | Query cache |

**Zustand verdict: Leave as-is.** React Query is purpose-built for server state — caching, refetching, loading/error states, cache invalidation. Zustand is not a replacement for this.

---

### 8. Browser API state (useSyncExternalStore)

| State | Location | Persistence |
|-------|----------|-------------|
| Gyroscope orientation | `useFoilGyroscope` (module-level external store) | Native API |
| Online/offline status | `useOnlineStatus` | Native API |

**Zustand verdict: No benefit.** These already use `useSyncExternalStore` correctly, which is the idiomatic React pattern for external subscriptions.

---

### 9. Service worker update state (React Context)

| State | Location | Persistence |
|-------|----------|-------------|
| `needRefresh`, `applyUpdate`, `checkForUpdate` | `SWUpdateContext` | Memory only |

**Zustand verdict: Small win.** Could eliminate the context boilerplate, but the SW update state is simple and only consumed by `ReloadPrompt`. Not worth the migration effort on its own.

---

### 10. Prop drilling hotspots

The biggest prop drilling happens in `CardBrowser`:

- **CardBrowser → FilterBar**: ~25 props (filter values + callbacks + sort + view + columns)
- **CardBrowser → FilterSidebar**: ~15 props (filter values + callbacks)
- **CardBrowser → ActiveFilters**: ~15 props (filter values + clear callbacks)
- **CardBrowser → CardGrid**: ~12 props (cards + display settings + callbacks)
- **CardBrowser → CardDetail**: ~8 props (card + callbacks)

However, most of this drilling comes from `useCardFilters()` output, which is URL state and should stay in `nuqs`. The display settings props (`showImages`, `cardFields`, `maxColumns`) are already available via `DisplaySettingsContext` but are still passed as props. Moving display settings to a Zustand store wouldn't change the prop count unless the child components read from the store directly instead of accepting props.

---

## Summary: What Would Actually Benefit from Zustand

### Worth migrating

| Current pattern | Zustand replacement | Lines saved | Complexity reduction |
|----------------|---------------------|-------------|---------------------|
| `DisplaySettingsContext` + 4x `useLocalStorage` in `__root.tsx` | Single `useDisplayStore` with `persist` middleware | ~50 lines | Eliminates context boilerplate, provider nesting, custom serializers |

### Could be folded in (marginal)

| Current pattern | Zustand replacement | Benefit |
|----------------|---------------------|---------|
| `useTheme` hook | Add `theme`/`toggleTheme` to display store | One fewer hook, unified preferences |
| `useSearchScope` hook | Add `searchScope`/`toggleField` to display store | Same — unified preferences |

### Leave alone

| Pattern | Reason |
|---------|--------|
| `nuqs` URL filters | URL sync is the whole point — Zustand can't replace this |
| React Query server state | Purpose-built for server state; Zustand is not |
| `useSyncExternalStore` hooks | Already idiomatic for browser APIs |
| Component-local `useState` | Scoped correctly, no cross-component sharing needed |
| SW update context | Simple, single consumer |

---

## Recommendation

**The honest assessment: Zustand would provide a modest improvement, not a transformational one.** The project's state management is already well-architected:

- Server state is correctly handled by React Query
- URL state is correctly handled by nuqs
- Browser API state uses proper `useSyncExternalStore`
- Local component state is properly scoped

The **one clear win** is consolidating the `DisplaySettingsContext` (showImages, richEffects, cardFields, maxColumns) — and optionally theme + search scope — into a single Zustand store with `persist`. This would:

1. Remove the context provider from `__root.tsx`, reducing nesting
2. Replace custom `useLocalStorage` serialization with Zustand's `persist` middleware
3. Let any component access settings without being wrapped in a provider (already true with context, but Zustand is slightly more ergonomic)
4. Allow child components like `CardGrid` and `CardThumbnail` to read display settings directly from the store instead of receiving them as props, reducing prop drilling in `CardBrowser`

If the goal is to reduce `CardBrowser`'s prop surface, the highest-impact change would be having child components read display settings from the store directly rather than accepting them as props.

Adding Zustand as a dependency for just this one use case is a judgment call — the current Context approach works fine. But if the project expects to add more shared UI state in the future (e.g., user preferences, layout modes, sidebar state), establishing a Zustand store now creates a clean pattern to build on.
