# Feature Flags

Feature flags gate longer-lived features that take multiple commits to complete. Flagged code can be pushed to `main`, tested on preview, and kept hidden on stable until it's ready. Once the feature is ready, the flag is removed and the code runs unconditionally.

## Managing flags

Flags are stored in the `feature_flags` database table and managed via the admin panel at `/admin/feature-flags`. Changes take effect on the next page load — no rebuild or restart needed.

To create a flag, go to the admin panel → Feature Flags → Add Flag. Keys use kebab-case (e.g. `deck-builder`).

## Using flags in code

### Web app

Flags are fetched from `GET /api/feature-flags` at app boot and cached in `localStorage` for offline/PWA use.

```ts
import { featureEnabled } from "@/lib/feature-flags";

if (featureEnabled("deck-builder")) {
  /* ... */
}
```

### API

Query the `feature_flags` table directly:

```ts
const flag = await db
  .selectFrom("feature_flags")
  .select("enabled")
  .where("key", "=", "deck-builder")
  .executeTakeFirst();

if (flag?.enabled) {
  /* ... */
}
```

## Behavior for unknown flags

`featureEnabled()` returns `false` for any flag that doesn't exist in the database. This means you can push code that references a flag before creating it in the admin panel — it will be treated as disabled until you create and enable it.

## Lifecycle

1. **Create** the flag in the admin panel (starts disabled)
2. **Gate** your code behind `featureEnabled("deck-builder")`
3. **Push** to `main` freely — the flag is off, so users won't see incomplete work
4. **Test** on preview by toggling the flag on in the preview admin panel
5. **Ship** by toggling the flag on in stable's admin panel
6. **Clean up** — once the feature is stable, remove the `featureEnabled()` check from code and delete the flag
