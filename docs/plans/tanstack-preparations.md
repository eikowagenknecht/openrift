# TanStack Start Migration — Preparation Checklist

All items below can be done **before** installing TanStack Start. They are safe,
incremental changes that improve SSR compatibility while keeping the current
Vite SPA fully functional.

---

## 1. Guard all browser-global access for SSR safety

**Why:** TanStack Start runs route code on the server. Any direct access to
`window`, `document`, `navigator`, `localStorage`, `globalThis.location` at
module scope or outside a `useEffect` will crash during SSR.

**Files to audit (18 files use browser globals):**

| File | Concern |
|------|---------|
| `stores/theme-store.ts` | Likely accesses `document.documentElement` to apply theme class |
| `lib/cookie-storage.ts` | Already has `typeof document === "undefined"` guards — OK |
| `lib/auth-client.ts:6` | `globalThis.location.origin` at **module level** — will crash on server |
| `lib/api-base.ts:7` | `location.hostname` at **module level** |
| `main.tsx` | Touch listeners on `document` (will be replaced, keep safe for now) |
| `hooks/use-foil-gyroscope.ts` | `navigator`/`window` access |
| `hooks/use-online-status.ts` | `navigator.onLine` |
| `hooks/use-favorite-sources.ts` | Likely `localStorage` |
| `hooks/use-card-detail-nav.ts` | Possible `window` access |
| `components/landing/card-scatter.tsx` | Likely `window` dimensions |
| `components/cards/use-scroll-indicator.ts` | `window.scrollY` or similar |
| `components/cards/use-grid-keyboard-nav.ts` | `document` keyboard events |
| `components/cards/card-grid-debug.tsx` | `window`/`document` access |
| `components/error-fallback.tsx` | `globalThis.location.reload()` |
| `components/profile/danger-zone-section.tsx` | `globalThis.location.href` |
| `components/ui/sidebar.tsx` | Browser API usage |
| `components/collection/add-to-collection-flow.tsx` | Browser API usage |
| `lib/phash-scanner.ts` | Browser API usage |

**Action:** Wrap all module-level browser access in functions or lazy
initializers. Use `typeof window !== "undefined"` guards or move access into
`useEffect` / event handlers. Code that only runs inside hooks/effects is fine.

---

## 2. Make `auth-client.ts` base URL configurable

```ts
// Current (breaks on server — no location available):
baseURL: globalThis.location.origin
```

**Action:** Accept the base URL as a parameter or resolve it lazily. TanStack
Start provides the request URL on the server side via `getWebRequest()`.

```ts
// Proposed:
export function createAuthClient(baseURL: string) {
  return createAuthClientImpl({ baseURL, plugins: [emailOTPClient()] });
}
// Default for client-side:
export const authClient = createAuthClient(
  typeof window !== "undefined" ? window.location.origin : "",
);
```

---

## 3. Make `api-base.ts` safe for server execution

`IS_PREVIEW` is computed at **module scope** using `location.hostname`.

**Action:** Wrap in a function so it's evaluated lazily:

```ts
export function isPreview(): boolean {
  if (typeof window === "undefined") return false;
  return PREVIEW_HOSTS.some((h) => location.hostname.endsWith(h));
}
```

---

## 4. Replace `import.meta.env` with a universal env pattern

TanStack Start uses Vinxi under the hood. `import.meta.env.VITE_*` won't work
the same way on the server.

**Files using `import.meta.env`:**

- `routes/__root.tsx` — `import.meta.env.PROD` (for devtools — low risk)
- `lib/api-base.ts` — `import.meta.env.VITE_PREVIEW_HOSTS`
- `components/error-fallback.tsx` — `import.meta.env.DEV`

**Action:** Centralize env access into a single `lib/env.ts` module. This makes
it trivial to swap the env source later.

---

## 5. Move `<head>` metadata from `index.html` into route-level config

TanStack Start manages `<head>` via route `meta`/`head` exports instead of a
static `index.html`.

Current `index.html` head content:

- `<title>OpenRift</title>`
- `<meta name="description" content="Fast. Open. Ad-free. A Riftbound companion.">`
- `<meta name="theme-color" content="#1d1538">`
- `<meta name="impact-site-verification" value="...">`
- `<link rel="preconnect" href="https://cmsassets.rgpub.io">`
- Favicon and icon links

**Action:** Create a `lib/meta.ts` with a `defaultHead` object containing all
these values. Ready to plug into Start's `routeOptions.head` later.

---

## 6. Extract `QueryClient` creation into a shared factory

Currently `QueryClient` is created in `main.tsx`. TanStack Start needs it
created **per-request** on the server to avoid cross-request data leakage.

**Action:** Move to `lib/query-client.ts`:

```ts
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { onError: (err) => toast.error(err.message) },
    },
  });
}
```

`main.tsx` calls this factory. Later, Start's server entry will too.

---

## 7. Verify router creation is browser-free

`router.ts` already exports a clean `createAppRouter(queryClient)` factory —
good. Verify it doesn't import any browser-only modules (currently clean).

**Action:** No change needed. Keep it clean.

---

## 8. Audit Zustand stores for SSR hydration

Three stores:

| Store | Persistence | SSR-safe? |
|-------|------------|-----------|
| `display-store.ts` | Cookies via `cookieStorage` | Yes — already guards `document` |
| `theme-store.ts` | Cookies via `cookieStorage` | Needs audit — may access `document.documentElement` at init |
| `search-scope-store.ts` | In-memory only | Yes |

**Action:** Verify `theme-store.ts` only accesses `document.documentElement`
inside effects or Zustand subscribers, never at the module level. The
cookie-based storage is already SSR-compatible (great foresight).

---

## 9. Check `nuqs` adapter compatibility

Currently using `nuqs/adapters/tanstack-router`. TanStack Start may need the
same or a different adapter.

**Action:** Check nuqs docs for a `/adapters/tanstack-start` entry point. If it
exists, prepare to switch the import in `__root.tsx`. No code change yet.

---

## 10. Isolate the PWA / service worker setup

TanStack Start has its own HTML generation, so `vite-plugin-pwa` integration
will change. SW registration must remain client-only.

**Action:**

- Extract PWA manifest config from `vite.config.ts` into a separate
  `pwa.config.ts` for reuse.
- Ensure `SWUpdateProvider` and `useRegisterSW` (from
  `virtual:pwa-register/react`) are only rendered on the client. They already
  use browser APIs, but wrapping in a client-only boundary is safer.

---

## 11. Plan the Cloudflare Worker replacement

Current `worker.ts` serves a static SPA with `index.html` fallback. TanStack
Start with Cloudflare needs an SSR entry point.

**Action:** No code change yet. Document that:

- `worker.ts` will be replaced by Start's Cloudflare preset/adapter.
- The `/api/*` and `/card-images/*` proxy logic must be preserved (either in the
  new worker entry or via Cloudflare routing rules).

---

## 12. Audit route loaders for SSR data-fetching readiness

Current loaders use `context.queryClient.ensureQueryData(...)` — already
TanStack Start-compatible. Verify:

- [ ] No loader accesses browser globals
- [ ] All `queryFn` functions use the RPC client (needs server-compatible base URL — see #13)
- [ ] Data returned from loaders is serializable (no class instances, functions, Dates as objects)

**Routes with loaders/beforeLoad:**

- `__root.tsx` — `beforeLoad` loads feature flags
- `_authenticated/route.tsx` — `beforeLoad` checks session
- `index.tsx` — `beforeLoad` checks session, redirects
- `cards.tsx` — `loader` fetches catalog
- Various admin routes — check each

---

## 13. Make the RPC client base URL configurable

```ts
// Current (relative URL — works in browser, not on server):
export const client = hc<AppType>("/", { init: { credentials: "include" } });
```

**Action:** Create a factory:

```ts
export function createRpcClient(baseUrl: string) {
  return hc<AppType>(baseUrl, { init: { credentials: "include" } });
}
// Default client for browser:
export const client = createRpcClient("/");
```

On the server, Start will call `createRpcClient("http://localhost:3000")` (or
the backend origin).

---

## 14. Adapt the card-images dev middleware

The custom `serve-card-images` Vite plugin uses `configureServer`. TanStack
Start (via Vinxi) has a different dev server.

**Action:** Consider moving card-image serving to:

- The API server (add a static-file route in Hono), or
- A standalone middleware compatible with Vinxi's dev server.

---

## 15. Prepare build scripts

Current: `tsr generate && tsc -b && vite build`

TanStack Start replaces `vite build` with its own build command. `tsr generate`
is still needed.

**Action:** No change yet. Be aware the `build` script will change to something
like `vinxi build`.

---

## 16. Upgrade TanStack Router to the version Start requires

Currently on `@tanstack/react-router` v1.166.7. TanStack Start requires
specific router versions.

**Action:** Check the latest TanStack Start release notes. Upgrade router,
router-plugin, router-cli, and devtools to the compatible version while still
running as a Vite SPA. This prevents a version jump during the actual migration.

---

## 17. Document chunk-splitting strategy for post-migration

The `manualChunks` config in `vite.config.ts` → `rolldownOptions` won't apply
in Start's build (which uses Vinxi/Nitro).

**Action:** No code change. Document the current chunking strategy so it can be
recreated in the new build config:

- `react` chunk: react, react-dom, scheduler, @tanstack/*
- `ui` chunk: @base-ui, @floating-ui, tailwind-merge, better-auth, react-hook-form, zod, nuqs, sonner, lucide-react, etc.

---

## 18. Make `__COMMIT_HASH__` injection portable

Currently injected via Vite's `define` in `vite.config.ts`.

**Action:** Grep for `__COMMIT_HASH__` usage and consider converting to an env
variable (e.g., `VITE_COMMIT_HASH` → `process.env.COMMIT_HASH`) which works
across build tools.

---

## 19. Verify `@/` path alias works with Vinxi

Current `tsconfig.json`: `@/* → ./src/*`. Vinxi respects tsconfig paths.

**Action:** No change needed. Verify after migration.

---

## 20. Check React Compiler compatibility with TanStack Start

React Compiler is enabled via `@rolldown/plugin-babel` with
`reactCompilerPreset()`. Start may need it configured differently (e.g., via
Vinxi's plugin system or a built-in option).

**Action:** Check Start docs for React Compiler integration guidance.

---

## Priority Matrix

| Priority | Items | Effort |
|----------|-------|--------|
| **High** | #1 Guard browser globals, #2 Auth client, #3 API base, #6 QueryClient factory, #13 RPC client factory | Medium |
| **Medium** | #4 Env access, #5 Head metadata, #8 Zustand audit, #10 PWA isolation, #12 Loader audit, #16 Upgrade router | Small–Medium |
| **Low** | #9 nuqs adapter, #11 Worker docs, #14 Card-images middleware, #15/#17/#18/#19/#20 awareness items | Trivial–Small |

**Recommended order:** Start with the High-priority items (#1–3, #6, #13) as
they make the entire data layer SSR-safe. Then work through Medium items. Low
items are mostly documentation or post-migration concerns.
