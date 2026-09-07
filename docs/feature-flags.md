# Feature Flags

Feature flags gate longer-lived features that take multiple commits to complete. Flagged code can be pushed to `main`, tested on preview, and kept hidden on stable until it's ready. Once the feature is ready, the flag is removed and the code runs unconditionally.

## Managing flags

Flags are stored in the `feature_flags` database table and managed via the admin panel at `/admin/feature-flags`. Changes take effect on the next page load — no rebuild or restart needed.

To create a flag, go to the admin panel → Feature Flags → Add Flag. Keys use kebab-case (e.g. `deck-builder`).

A flag can also be overridden for a single user under "Per-user overrides" on the same page. An override wins over the global default, which is how a feature gets tested by a real account on stable before it is turned on for everyone.

## Using flags in code

### Web app

Flags come from `GET /api/v1/feature-flags` through a server function, so SSR resolves them and they land in the initial HTML. React Query holds them for five minutes (`featureFlagsQueryOptions` in `apps/web/src/lib/feature-flags.ts`) and does not refetch on window focus. There is no `localStorage` copy and no service worker — a flag change reaches a client on the next load, or after the five-minute window.

When the request carries a session, the API merges that user's overrides over the global defaults, so the flags a component sees are already the effective ones.

In a component, use the hook:

```tsx
import { useFeatureEnabled } from "@/hooks/use-feature-flags";

const glossaryEnabled = useFeatureEnabled("glossary");
```

In a route guard, read the flags first, then test them. `featureEnabled` takes the flags map and the key:

```ts
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";

beforeLoad: async ({ context }) => {
  const flags = (await context.queryClient.ensureQueryData(
    featureFlagsQueryOptions,
  )) as FeatureFlags;
  if (!featureEnabled(flags, "glossary")) {
    throw redirect({ to: "/cards" });
  }
},
```

### API

Go through the feature-flags repository — never touch the table with a raw `db` query (see the database-access rule in `CLAUDE.md`). Route handlers reach the repos via `c.get("repos")`; services take them as a parameter.

```ts
if (await repos.featureFlags.isEnabled("deck-builder")) {
  /* ... */
}
```

`isEnabled` returns `undefined` when no row exists for the key, so a check that should treat a missing flag as _on_ must compare explicitly:

```ts
if ((await repos.featureFlags.isEnabled("deck-builder")) === false) {
  return; // only an explicitly disabled flag short-circuits
}
```

## Behavior for unknown flags

The two sides differ, and the difference is the whole reason the API snippet above compares against `false`:

- **Web** — `featureEnabled()` and `useFeatureEnabled()` return `false` for a flag with no row, because the response only carries keys that exist. So you can push code referencing a flag before creating it in the admin panel, and the gated feature stays hidden until you create and enable it.
- **API** — `isEnabled()` returns `undefined` for a flag with no row. A bare `if (await repos.featureFlags.isEnabled(key))` therefore treats an unknown flag as off, while the `=== false` kill-switch form treats it as on. Pick the one you mean.

## Active flags

The canonical list of known flags lives in the `KNOWN_FLAGS` array in `apps/web/src/features/admin/components/feature-flags-page.tsx`. Unconfigured known flags appear in the admin UI under "Available flags" for easy setup.

When adding a new flag, add an entry to `KNOWN_FLAGS` so it shows up in the admin panel with a description and one-click setup.

## Lifecycle

1. **Create** the flag in the admin panel (starts disabled)
2. **Gate** your code behind `useFeatureEnabled("deck-builder")`, or `featureEnabled(flags, "deck-builder")` in a route guard
3. **Push** to `main` freely — the flag is off, so users won't see incomplete work
4. **Test** on preview by toggling the flag on in the preview admin panel, or on stable with a per-user override for your own account
5. **Ship** by toggling the flag on in stable's admin panel
6. **Clean up** — once the feature is stable, remove the check from code, then delete the flag and any leftover per-user overrides
