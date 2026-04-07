# TanStack Start Migration Plan

A step-by-step plan to migrate the web app from a Vite SPA to TanStack Start
with streaming SSR. Each step is self-contained: the app works after every step.

---

## Current State

- **Web**: Vite 8 SPA with TanStack Router (file-based) + TanStack Query +
  better-auth client + Zustand stores + nuqs
- **API**: Separate Hono server (Kysely/Postgres, cron jobs, better-auth server)
- **Deployment**: Docker on Hetzner VPS. Nginx serves static SPA + reverse
  proxies `/api` to Hono. Cloudflare in front for CDN/TLS.
- **Key advantage**: Already on TanStack Router with file-based routing, so route
  files need minimal changes. Already using `useSuspenseQuery` everywhere, which
  defines natural streaming boundaries.

The Hono API stays as-is throughout. The migration converts the web app from a
Vite SPA to a TanStack Start app with streaming SSR.

---

## Key Decisions

1. **No Vinxi.** TanStack Start dropped Vinxi in v1.121. It is now a standard
   Vite plugin (`tanstackStart()` from `@tanstack/react-start/plugin/vite`).
   Build commands are plain `vite dev` / `vite build`.

2. **Nitro v3 for deployment.** The `nitro` package (v3, imported as
   `nitro/vite`) is an optional Vite plugin for production server presets (Node,
   Bun, etc.). It is not in the critical build path.

3. **Bun runtime.** The Start server runs on Bun (matching the API server). The
   Nitro preset is `"bun"`, the Docker image is `oven/bun`, and memory is
   managed via `BUN_JSC_maxHeapSize` (JavaScriptCore, Bun's engine).

4. **Keep the API boundary.** Server functions call the Hono API over HTTP (via
   an internal URL), not by importing Kysely repositories directly. This keeps
   the web and API packages decoupled. The `/api/*` endpoints remain available
   for direct access (e.g., a future mobile app).

5. **Streaming SSR by default.** TanStack Start uses `defaultStreamHandler`,
   which streams HTML using `<Suspense>` boundaries. Existing `useSuspenseQuery`
   calls already define the streaming slots. No extra work needed for basic
   streaming.

6. **Drop Cloudflare Workers preview.** Everything runs on the VPS now. Remove
   `worker.ts` and CF-specific code.

7. **Display preferences stay in localStorage.** Only the theme (light/dark) is
   in cookies (already the case). Display preferences like `showImages`,
   `fancyFan`, `maxColumns` are not worth putting in cookies because: (a)
   they're large (arrays of languages, marketplace order), (b) they'd bloat every
   request, and (c) the visual difference between server defaults and
   client-hydrated values is minimal for these settings. Cards load images async
   anyway; column count is viewport-responsive. The only flash that matters is
   theme, which is already SSR-safe via cookie storage.

---

## Step 0: Prerequisites (SSR-safety audit)

**Goal:** Fix all module-scope browser globals and singletons so every file can
be imported on the server without crashing.

### 0a. Fix `auth-client.ts` (crashes on import during SSR)

The auth client is created at module scope with `globalThis.location.origin`,
which doesn't exist on the server.

**Fix:** Split into two modules:

- `lib/auth-client.ts` (browser-only, keep current code but guard
  `globalThis.location.origin` with a `typeof window` check, or lazy-init)
- `lib/auth-session.ts` (server function that calls the API directly, plus the
  new `sessionQueryOptions` that works on both server and client)

For the session query, the pattern becomes:

```ts
// lib/auth-session.ts
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3000";

export const getServerSession = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const cookie = request.headers.get("cookie") ?? "";
  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { cookie },
  });
  if (!res.ok) return null;
  return res.json();
});

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: ["session"],
    queryFn: () => getServerSession(),
  });
```

The `createServerFn` call runs on the server during SSR and is automatically
called via RPC from the client. The browser auth client (`authClient`) is only
imported in client-side code that needs `signIn`, `signUp`, `signOut` (which are
user-triggered actions, never during SSR).

### 0b. Fix `rpc-client.ts` (relative URL breaks on server)

The RPC client singleton uses `"/"` which doesn't resolve server-side.

**Fix:** Make it a lazy getter with environment-aware base URL:

```ts
import type { AppType } from "api/rpc";
import { hc } from "hono/client";

function getBaseUrl() {
  if (typeof window === "undefined") {
    return process.env.API_INTERNAL_URL ?? "http://localhost:3000";
  }
  return "/";
}

function createRpcClient(baseUrl: string) {
  return hc<AppType>(baseUrl, { init: { credentials: "include" } });
}

let _client: ReturnType<typeof createRpcClient> | null = null;

export function getClient() {
  if (!_client) {
    _client = createRpcClient(getBaseUrl());
  }
  return _client;
}
```

Note: The singleton is fine for the client (one process, one user). On the
server, requests don't carry per-user cookies on the RPC client itself (cookies
are forwarded explicitly in server functions). If the RPC client is only used in
server functions that forward cookies manually, the singleton is safe. If route
loaders still use it directly during SSR, cookies must be forwarded.

### 0c. Add `API_INTERNAL_URL` environment variable

Add `API_INTERNAL_URL` to `.env` and document it:

- **Dev:** `http://localhost:3000` (API runs natively)
- **Docker:** `http://api:3000` (Docker service name)

This is used by server functions to reach the Hono API from the SSR server
process. It must NOT be exposed to the client (no `VITE_` prefix).

### 0d. Update `env.ts` for server/client awareness

`env.ts` uses `import.meta.env.*` which works in Vite on both server and client.
`VITE_*`-prefixed vars are exposed to the client bundle; non-prefixed vars are
server-only. The current setup is already correct:

- `import.meta.env.PROD` works on both sides
- `import.meta.env.VITE_PREVIEW_HOSTS` works on both sides (client-safe)
- `import.meta.env.VITE_SENTRY_DSN` works on both sides (client-safe)

Add a note for server-only vars: use `process.env.API_INTERNAL_URL` directly in
server functions, not through `env.ts` (since `env.ts` is imported client-side).

### 0e. Validate `display-store.ts` SSR behavior

The display store uses Zustand's `persist` middleware with default `localStorage`
storage. During SSR, Zustand's persist middleware checks
`typeof window !== "undefined"` internally and skips hydration on the server. The
store initializes with defaults.

**No change needed.** The server renders with defaults; the client hydrates from
localStorage after mount. The visual difference is negligible because:

- Card images load async regardless (no layout shift)
- Effects (`fancyFan`, `foilEffect`, `cardTilt`) are CSS overlays applied after
  render
- Column count is computed from viewport width, not from the store
- Theme is the only flash-sensitive preference, and it's already SSR-safe via
  cookie storage

### ~~0f. Fix theme flash during SSR~~ → moved to Step 2

Requires `getRequest()` from `@tanstack/react-start/server`, which is not
available until TanStack Start is installed in Step 1. The fix (reading the
`theme` cookie in the `shellComponent`) is applied in Step 2 when the server
entry point is created.

### 0g. Audit Sentry initialization

`initSentry()` uses `@sentry/react` with `browserTracingIntegration()` and
`replayIntegration()`. These are browser-only APIs.

**No change needed yet.** Currently called in `main.tsx` (client entry). In Step
2, it moves to `client.tsx` (the new client entry), which only runs in the
browser. The server doesn't import or call `initSentry`.

### 0h. Align TanStack package versions

Update all `@tanstack/*` packages to the latest release in the same family:

```
@tanstack/react-router         → latest 1.x
@tanstack/react-router-devtools → same release
@tanstack/router-cli            → same release
@tanstack/router-plugin         → same release
@tanstack/react-query           → latest 5.x
@tanstack/react-table           → latest
@tanstack/react-virtual         → latest
@tanstack/react-hotkeys         → latest
```

Keep `@tanstack/router-cli` for now (the `tsr generate` command is still used in
the build script). It can be removed in Step 7 if `tanstackStart()` handles
route generation at build time without it.

**Verify:** `bun dev:web` starts, all routes work, no version mismatch warnings.

---

## Step 1: Add TanStack Start and update build config

**Goal:** Replace the plain Vite SPA build with TanStack Start's build pipeline,
but keep the app client-rendered (no SSR yet). The app builds and runs
identically.

**Changes:**

- Install new dependencies:
  ```
  @tanstack/react-start
  @tanstack/react-router-ssr-query
  nitro
  ```
- Update `apps/web/vite.config.ts`:
  - Add `tanstackStart({ srcDirectory: "src" })` plugin (before `react()`)
  - Add `nitro({ preset: "bun" })` plugin
  - Keep existing plugins: `tailwindcss()`, `react()`, `babel()` (React
    Compiler), `sentryVitePlugin()`, `VitePWA()`
  - Keep `rolldownOptions` for chunk splitting (Vite 8 + Rolldown is supported)
  - Remove the `tanstackRouter()` plugin (replaced by `tanstackStart()` which
    includes router functionality)
  - **Keep** `server.proxy` for now (`{ "/api": "http://localhost:3000" }`) so
    API calls still work during dev. Remove it later in Step 5 after server
    functions handle all API communication.
  - **Keep** the custom `serve-card-images` dev plugin for now so card images
    load in dev. Remove in Step 7 and replace with a Nitro server middleware or
    a proxy rule.
- Update `apps/web/package.json` scripts:
  ```json
  "dev": "vite dev --clearScreen false",
  "build": "tsr generate && tsc -b && vite build",
  "start": "bun run .output/server/index.mjs",
  "preview": "vite preview"
  ```
- Update `turbo.json` if build outputs change (`.output/` instead of `dist/`)
- Delete `apps/web/index.html` (TanStack Start generates the HTML document via
  `shellComponent` in `__root.tsx`)

**Vite 8 + Rolldown compatibility notes:**

- `@tanstack/react-start` requires `vite >= 7.0.0` (Vite 8 satisfies this)
- `nitro` v3 declares `vite ^7 || ^8` as a peer dependency
- `@tanstack/start-plugin-core` already uses `@rolldown/pluginutils` internally
- Ensure `@vitejs/plugin-react` is `>= 5.0.3` to avoid Rolldown HMR issues

**Verify:** `bun dev:web` starts (via `vite dev`), all pages load, HMR works.
Build produces `.output/` directory.

---

## Step 2: Add server and client entry points

**Goal:** Add the entry files TanStack Start requires for SSR bootstrapping, but
still render client-only initially.

**Changes:**

- Create `apps/web/src/client.tsx`:

  ```tsx
  import { StartClient } from "@tanstack/react-start/client";
  import { StrictMode } from "react";
  import { hydrateRoot } from "react-dom/client";

  import { initSentry } from "./lib/sentry";
  import { preventIOSOverscroll } from "./lib/ios-overscroll-prevention";
  import "./index.css";

  initSentry();
  preventIOSOverscroll();

  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
  ```

- Create `apps/web/src/server.ts`:

  ```ts
  import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

  export default createServerEntry({
    fetch(request) {
      return handler.fetch(request);
    },
  });
  ```

- Update `apps/web/src/router.ts` to use `getRouter()` factory with per-request
  QueryClient and the SSR query integration:

  ```ts
  import { createRouter } from "@tanstack/react-router";
  import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

  import { RouterErrorFallback } from "./components/error-fallback";
  import { NotFoundFallback } from "./components/error-message";
  import { createQueryClient } from "./lib/query-client";
  import { routeTree } from "./routeTree.gen";

  export function getRouter() {
    const queryClient = createQueryClient();

    const router = createRouter({
      routeTree,
      context: { queryClient },
      defaultPreload: "intent",
      defaultErrorComponent: RouterErrorFallback,
      defaultNotFoundComponent: NotFoundFallback,
      scrollRestoration: true,
    });

    setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: true });

    return router;
  }

  declare module "@tanstack/react-router" {
    interface Register {
      router: ReturnType<typeof getRouter>;
    }
    interface StaticDataRouteOption {
      title?: string;
      hideFooter?: boolean;
    }
  }
  ```

  **Critical:** `createQueryClient()` is called inside `getRouter()`, not at
  module scope. On the server, `getRouter()` is called per-request, giving each
  request an isolated QueryClient. This prevents user A's cached session from
  leaking into user B's response.

- Update `__root.tsx` to use Start's document model:

  ```tsx
  import type { QueryClient } from "@tanstack/react-query";
  import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
  import { getRequest } from "@tanstack/react-start/server";
  import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
  import { lazy } from "react";

  import { Analytics } from "@/components/analytics";
  import { RouteNotFoundFallback } from "@/components/error-message";
  import { Toaster } from "@/components/ui/sonner";
  import { PROD } from "@/lib/env";
  import { featureFlagsQueryOptions } from "@/lib/feature-flags";
  import { siteSettingsQueryOptions } from "@/lib/site-settings";

  // Import CSS as a URL for the head() function (Vite resolves this at build time)
  import indexCss from "@/index.css?url";

  const TanStackRouterDevtools = PROD
    ? () => null
    : lazy(async () => {
        const mod = await import("@tanstack/react-router-devtools");
        return { default: mod.TanStackRouterDevtools };
      });

  export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "description", content: "Built with Fury. Maintained with Calm." },
        { name: "theme-color", content: "#1d1538" },
      ],
      links: [
        { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon-64x64.png" },
        { rel: "icon", type: "image/webp", href: "/logo.webp" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon-180x180.png" },
        { rel: "stylesheet", href: indexCss },
      ],
    }),
    beforeLoad: async ({ context }) => {
      // Feature flags and site settings — non-critical, fallback to empty
      try {
        await context.queryClient.ensureQueryData(featureFlagsQueryOptions);
      } catch {
        context.queryClient.setQueryData(featureFlagsQueryOptions.queryKey, {});
      }
      try {
        await context.queryClient.ensureQueryData(siteSettingsQueryOptions);
      } catch {
        context.queryClient.setQueryData(siteSettingsQueryOptions.queryKey, {});
      }
    },
    component: RootComponent,
    notFoundComponent: RouteNotFoundFallback,
    shellComponent: RootDocument,
  });

  /** Reads the theme preference from the cookie during SSR to avoid a flash. */
  function getServerThemeClass(): string {
    if (typeof window !== "undefined") return "";
    try {
      const request = getRequest();
      const cookieHeader = request.headers.get("cookie") ?? "";
      const match = cookieHeader.match(/(?:^|;\s*)theme=([^;]*)/);
      if (!match) return "";
      const decoded = decodeURIComponent(match[1]);
      const parsed = JSON.parse(decoded);
      const pref = parsed?.state?.preference ?? "auto";
      // "auto" → "light" on server (no matchMedia), explicit "dark" → "dark"
      return pref === "dark" ? "dark" : "";
    } catch {
      return "";
    }
  }

  function RootDocument({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en" className={getServerThemeClass()}>
        <head>
          <HeadContent />
        </head>
        <body>
          {children}
          <Scripts />
        </body>
      </html>
    );
  }

  function RootComponent() {
    return (
      <NuqsAdapter>
        <div className="bg-background text-foreground flex min-h-screen flex-col">
          <Outlet />
          <Toaster position="bottom-right" />
        </div>
        <Analytics />
        <TanStackRouterDevtools />
      </NuqsAdapter>
    );
  }
  ```

  **Note on QueryClientProvider:** Pass `wrapQueryClient: true` to
  `setupRouterSsrQueryIntegration` in `router.ts` (shown above). This
  auto-wraps the app with `<QueryClientProvider>`, so you don't need to add it
  manually. If that doesn't work, wrap `<Outlet />` in `RootComponent` with
  `<QueryClientProvider client={queryClient}>` and access `queryClient` from
  the route context.

- Delete `apps/web/src/main.tsx` (replaced by `client.tsx`)

**Verify:** App builds and hydrates on client. `view-source` shows the HTML
document shell with `<HeadContent />` rendered meta tags.

---

## Step 3: Enable streaming SSR

**Goal:** The server renders full HTML with React content streamed via Suspense
boundaries. This is the core SSR step.

**Changes:**

- The `server.ts` entry from Step 2 already uses `defaultStreamHandler` (via the
  default `handler.fetch`). Streaming is on by default.
- All route loaders that call `ensureQueryData` now run on the server during SSR.
  TanStack Query data is dehydrated into the HTML stream and rehydrated on the
  client via `setupRouterSsrQueryIntegration` (no double-fetching).
- The `featureFlagsQueryOptions` and `siteSettingsQueryOptions` in `__root.tsx`
  `beforeLoad` use the RPC client, which now resolves to the internal API URL on
  the server (Step 0b).

**Server-side API calls:** Route loaders call the Hono API via the RPC client.
During SSR, these requests come from the Start server process, not the browser:

- The RPC client uses `API_INTERNAL_URL` on the server (Step 0b)
- Cookies must be forwarded from the incoming request for authenticated routes.
  This is handled by passing cookies through the router context or by using
  server functions (Step 4).
- For public routes (catalog, feature flags, site settings), no cookies are
  needed. These work immediately.

**Streaming behavior:** With streaming SSR, the page renders progressively:

1. Server sends the document shell (`<html>`, `<head>`, nav) immediately
2. When a `useSuspenseQuery` is encountered, the Suspense fallback is sent
3. As data arrives from the API, the real content replaces the fallback via
   inline `<script>` tags
4. The browser shows the page progressively

Existing `useSuspenseQuery` calls already define the streaming slots. No
`<Suspense>` boundaries need to be added manually for basic streaming.

**Verify:** `view-source` shows rendered HTML with card data. Pages load faster
(no client-side data waterfall). Public routes render fully server-side.

---

## Step 4: Server-side auth with `createServerFn`

**Goal:** Move auth session checking to server functions so the session is
resolved server-side (faster, no flash of unauthenticated content on protected
routes).

**Changes:**

- Create `apps/web/src/lib/auth-session.ts` with server functions (as described
  in Step 0a):

  ```ts
  import { createServerFn } from "@tanstack/react-start";
  import { getRequest } from "@tanstack/react-start/server";
  import { queryOptions } from "@tanstack/react-query";

  const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3000";

  export const getServerSession = createServerFn({ method: "GET" }).handler(async () => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    const res = await fetch(`${API_URL}/api/auth/get-session`, {
      headers: { cookie },
    });
    if (!res.ok) return null;
    return res.json();
  });

  export const sessionQueryOptions = () =>
    queryOptions({
      queryKey: ["session"],
      queryFn: () => getServerSession(),
    });
  ```

- Update `_authenticated/route.tsx` and `admin/route.tsx` `beforeLoad` to use the
  new `sessionQueryOptions` (they likely already call
  `ensureQueryData(sessionQueryOptions())`, so swapping the import is sufficient)
- Convert `featureFlagsQueryOptions` and `siteSettingsQueryOptions` to use server
  functions too (they're loaded in `__root.tsx` and benefit from server-side
  fetching without proxy hops)
- **Upgrade theme SSR:** Replace the current blocking `<script>` +
  `suppressHydrationWarning` approach with a server function that reads the
  theme cookie via `getCookie` / `getRequest()`, returns it through
  `beforeLoad` context, and applies the class in `shellComponent` via
  `Route.useRouteContext()`. This gives correct HTML from the first byte
  (no script needed). Keep the inline script as a fallback for edge cases.

**Why server functions instead of direct RPC?** During SSR, the RPC client
doesn't carry the user's cookies. Server functions access the incoming request
via `getRequest()` and forward cookies explicitly. This is the correct pattern
for all authenticated data fetching during SSR.

**Verify:** Auth redirects work without a flash. Protected pages render
server-side with user data. Login/logout still work. Client-side navigation to
protected routes calls the server function via automatic RPC bridging.

---

## Step 5: Convert remaining data fetching to server functions (incremental)

**Goal:** Move API calls behind server functions where it benefits SSR. This is
incremental and each route is independently deployable.

**Priority order** (high traffic / most SSR benefit first):

1. `/cards` - `catalogQueryOptions` (biggest payload, biggest SSR win)
2. `/collections` - `collectionsQueryOptions`, `copiesQueryOptions`
3. `/decks` - `decksQueryOptions`, `deckDetailQueryOptions`
4. Admin routes - lower priority, admin-only

**Pattern for each:**

```ts
const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3000";

const fetchCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const cookie = request.headers.get("cookie") ?? "";
  const res = await fetch(`${API_URL}/api/v1/catalog`, {
    headers: { cookie },
  });
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
  return res.json();
});
```

Then update the `queryOptions` to use the server function. Components using
`useSuspenseQuery` don't change at all.

**Recommended: auth middleware.** Since most server functions need cookie
forwarding, extract it into reusable TanStack Start middleware:

```ts
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const withCookies = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  const cookie = request.headers.get("cookie") ?? "";
  return next({ context: { cookie } });
});

// Usage:
const fetchCatalog = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/catalog`, {
      headers: { cookie: context.cookie },
    });
    // ...
  });
```

**Once all routes use server functions:** Remove `server.proxy` from
`vite.config.ts`. The Vite dev proxy is no longer needed since all API calls go
through server functions (which use `API_INTERNAL_URL` internally).

**Verify after each route:** Page renders server-side with data. Client
navigation still works. No regressions.

---

## Step 6: Update deployment

**Goal:** The web app is now a Bun server process, not static files. Update
Docker, nginx, and infrastructure.

### 6a. Dockerfile stages

Replace the old nginx `web` stage with two stages: a Bun SSR server and an
nginx reverse proxy:

```dockerfile
# ─── Stage 3: Web (TanStack Start SSR server) ───────────────────────────────
FROM oven/bun:1-alpine AS web

WORKDIR /app
COPY --from=build /app/apps/web/.output .output
EXPOSE 3001

# Bun memory limit (default is 4GB, constrain for the VPS)
ENV BUN_JSC_maxHeapSize=512

CMD ["bun", "run", ".output/server/index.mjs"]

# ─── Stage 4: Proxy (nginx — reverse proxy + static asset serving) ──────────
FROM nginx:alpine AS proxy

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/web.conf /etc/nginx/conf.d/web.conf
# Built client assets (JS/CSS with content hashes) served directly by nginx
COPY --from=build /app/apps/web/.output/public /srv/static
EXPOSE 8080
```

The `web` container runs the Start SSR server on port 3001 (internal only). The
`proxy` container runs nginx on port 8080 (exposed to the host). Card images are
bind-mounted into the `proxy` container at `/srv/static/card-images/`.

### 6b. Docker Compose

Replace the old `web` service with two services: `web` (Start SSR) and `proxy`
(nginx):

```yaml
# TanStack Start SSR server (internal only — not exposed to host).
web:
  image: ghcr.io/eikowagenknecht/openrift-web:${IMAGE_TAG:-latest}
  depends_on:
    - api
  healthcheck:
    test: ["CMD-SHELL", "wget -qO- http://localhost:3001/health || exit 1"]
    interval: 10s
    timeout: 3s
    retries: 3
  environment:
    PORT: "3001"
    API_INTERNAL_URL: "http://api:3000"
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "10"
  restart: unless-stopped

# Nginx reverse proxy + static asset serving (exposed to host).
proxy:
  image: ghcr.io/eikowagenknecht/openrift-proxy:${IMAGE_TAG:-latest}
  depends_on:
    - web
    - api
  healthcheck:
    test: ["CMD-SHELL", "wget -qO- http://localhost:8080/health || exit 1"]
    interval: 10s
    timeout: 3s
    retries: 3
  volumes:
    - ./card-images:/srv/static/card-images:ro
  ports:
    - "127.0.0.1:${WEB_PORT:-8080}:8080"
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "10"
  restart: unless-stopped
```

The host nginx (TLS termination) proxies to the `proxy` container on `:8080`,
same as before. Update the host nginx config to reference the `proxy` service
instead of the old `web` service (the port stays the same).

### 6c. Health endpoint

Add a `/health` endpoint for Docker health checks. Intercept it in the server
entry before the router to avoid React rendering overhead:

```ts
// apps/web/src/server.ts
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export default createServerEntry({
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }
    return handler.fetch(request);
  },
});
```

This returns a plain-text "ok" response without invoking the router or rendering
React. The `web` container's healthcheck calls this directly
(`http://localhost:3001/health`). The `proxy` container's healthcheck also hits
`/health`, which nginx proxies to the Start server (verifying the full chain).

### 6d. Nginx config (reverse proxy for SSR + static assets)

Updated `nginx/web.conf` for the `proxy` container (see 6a and 6b for how it's
built and deployed):

```nginx
limit_req_zone $http_x_real_ip zone=api:10m rate=30r/s;

# CSP header value. Streaming SSR injects inline <script> tags for each
# streamed Suspense chunk, so 'unsafe-inline' is required for script-src.
# Nonce-based CSP is impractical with streaming (CSP header is sent before
# chunks are generated). 'unsafe-eval' dropped — not needed.
map $uri $csp_header {
    default "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';";
}

# Resolve X-Real-IP at the server level so it's available in all locations.
map $http_x_real_ip $real_ip {
    default $http_x_real_ip;
    ""      $remote_addr;
}

server {
    listen 8080;
    server_name _;

    # ── Security headers (server-level defaults) ─────────────────────────
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(self)" always;
    add_header Content-Security-Policy $csp_header always;

    # ── API: proxy to Hono (unchanged) ───────────────────────────────────
    location /api/ {
        client_max_body_size 50m;
        limit_req zone=api burst=60 nodelay;
        limit_req_status 429;
        proxy_pass http://api:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $real_ip;
        proxy_set_header X-Forwarded-For $http_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    }

    # ── Static: hashed assets (immutable, long cache) ────────────────────
    location /assets/ {
        root /srv/static;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri =404;
    }

    # ── Static: card images (immutable, long cache) ──────────────────────
    location /card-images/ {
        root /srv/static;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri =404;
    }

    # ── Service worker (never cached) ────────────────────────────────────
    location = /sw.js {
        proxy_pass http://web:3001;
        add_header Cache-Control "no-cache";
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Content-Security-Policy $csp_header always;
    }

    # ── Everything else: proxy to TanStack Start SSR server ──────────────
    location / {
        proxy_pass http://web:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $real_ip;
        proxy_set_header X-Forwarded-For $http_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 30s;

        # SSR responses should not be cached by the browser — the server
        # renders fresh content per request (user-specific data, auth state).
        add_header Cache-Control "no-cache" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Content-Security-Policy $csp_header always;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
    gzip_min_length 256;
}
```

**CSP note:** Streaming SSR injects inline `<script>` tags for each streamed
chunk (they swap Suspense fallbacks with real content). Nonce-based CSP is
impractical with streaming because each chunk needs a nonce, and the CSP header
is sent before chunks are generated. `'unsafe-inline'` for `script-src` is the
pragmatic choice. `'unsafe-eval'` can be dropped if testing confirms nothing
needs it (it wasn't needed before, the old config had it "just in case").

**Static assets:** The `proxy` Dockerfile stage (6a) copies
`.output/public/` to `/srv/static/` at build time, so nginx serves hashed
JS/CSS directly. Card images are bind-mounted into the `proxy` container at
`/srv/static/card-images/` (see 6b).

### 6e. Memory and process management

An SSR server uses more resources than serving static files:

**Memory:**

- Each concurrent SSR request renders React components in memory. For the card
  catalog page (~500 cards), a single render may use 5-10 MB temporarily.
- Streaming helps: HTML is flushed incrementally, so the full rendered page is
  never held in memory at once.
- Set `BUN_JSC_maxHeapSize=512` (MB) in the container to prevent runaway memory
  usage. Adjust based on monitoring.
- Docker Compose `deploy.resources.limits.memory: 1g` as a hard cap.

**Timeouts:**

- SSR renders that depend on slow API responses could hang. If the Hono API
  takes >5s, the SSR response will be slow.
- Set `proxy_read_timeout 30s` in nginx for the `location /` block. If SSR takes
  longer than 30s, nginx returns 504 and the client falls back to client-side
  rendering.
- Consider adding a timeout in the server entry or server functions.

**Graceful shutdown:**

- Bun handles `SIGTERM` for graceful shutdown by default. Docker sends `SIGTERM`
  on `docker stop`, waits 10s, then `SIGKILL`. This is sufficient.
- If SSR requests are long-lived (streaming), increase `stop_grace_period: 15s`
  in Docker Compose to let in-flight streams complete.

**Monitoring:**

- Watch container memory usage via `docker stats` or a monitoring stack.
- Log SSR render times (TanStack Start doesn't log these by default; add
  timing in `server.ts` if needed).
- The existing Sentry integration on the API catches backend errors. Add
  `@sentry/bun` to the web container for SSR-specific error tracking if needed.

**Restart policy:**

- `restart: unless-stopped` (already in place) handles crashes. Docker
  automatically restarts the container.

### 6f. PWA verification

- Verify service worker registration works with SSR
- The `selfDestroying: true` PWA config means old service workers auto-uninstall,
  which should be fine
- Test offline mode and install prompt
- The PWA manifest is served as a static file, unaffected by SSR

**Verify:** Production build works in Docker. Pages SSR correctly. Static assets
have correct cache headers. Health check passes. Memory usage is stable under
load. PWA installs and works.

---

## Step 7: Cleanup

**Goal:** Remove legacy code and finalize.

**Changes:**

- Delete `apps/web/src/worker.ts` (Cloudflare Workers preview, no longer needed)
- Delete old `vite.config.ts` backup if kept temporarily
- Remove the `serve-card-images` dev plugin and Vite proxy config from
  `vite.config.ts` (server functions and Nitro middleware now handle these)
- Remove `@tanstack/router-cli` from devDependencies if `tanstackStart()` plugin
  handles route generation at build time without `tsr generate`
- Remove `wrangler.toml` and CF Workers deployment config if present
- Audit bundle size: SSR reduces the initial JS payload since data is embedded in
  HTML. The client bundle should be smaller (no initial data fetch waterfall).
- Update `CLAUDE.md` with new commands and architecture:
  - `bun dev:web` now runs `vite dev` (TanStack Start)
  - Build output is `.output/` (not `dist/`)
  - `API_INTERNAL_URL` env var documented
  - Architecture diagram updated
- Update `docs/architecture.md` with new infrastructure diagrams
- Update `docs/deployment.md`

---

## Step 8: Server-side cache for public data (optimization)

**Goal:** Avoid redundant API calls for public, non-user-specific data during
SSR. Every SSR request currently creates a fresh QueryClient (for security),
which means the catalog (~large payload) is re-fetched from the Hono API on
every page load, even though the data is the same for all users.

**Changes:**

- Create a shared, long-lived `QueryClient` on the Start server that caches
  public data only (catalog, feature flags, site settings, enums, keyword styles,
  rules). This is separate from the per-request QueryClient.
- In server functions for public endpoints, check the shared cache first:

  ```ts
  // lib/server-cache.ts
  import { QueryClient } from "@tanstack/react-query";

  // Singleton — lives for the lifetime of the server process.
  // Only used for public, non-user-specific data.
  const serverCache = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute (matches API's Cache-Control max-age)
        gcTime: 5 * 60 * 1000, // 5 minutes
      },
    },
  });

  export { serverCache };
  ```

- Update the catalog server function to use the shared cache:

  ```ts
  import { serverCache } from "@/lib/server-cache";

  const fetchCatalogServer = createServerFn({ method: "GET" }).handler(async () => {
    return serverCache.fetchQuery({
      queryKey: ["catalog"],
      queryFn: async () => {
        const res = await fetch(`${API_URL}/api/v1/catalog`);
        if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
        return res.json();
      },
    });
  });
  ```

- `fetchQuery` returns cached data if fresh, or fetches and caches if stale.
  This means 100 concurrent SSR requests for `/cards` result in 1 API call (or
  0, if the cache is fresh), not 100.

**What goes in the shared cache:**

| Query              | Public? | Cache here? |
| ------------------ | ------- | ----------- |
| catalog            | Yes     | Yes         |
| feature flags      | Yes     | Yes         |
| site settings      | Yes     | Yes         |
| enums              | Yes     | Yes         |
| keyword styles     | Yes     | Yes         |
| rules              | Yes     | Yes         |
| session            | No      | **No**      |
| collections/copies | No      | **No**      |
| decks              | No      | **No**      |

**Important:** Never put user-specific data in the shared cache. Auth-dependent
queries always use the per-request QueryClient with forwarded cookies.

**Verify:** Monitor API call volume before and after. The Hono API's catalog
endpoint should see dramatically fewer requests from the Start server.

---

## Risk Mitigation

| Risk                                  | Mitigation                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| RPC client breaks in SSR (no cookies) | Step 0b fixes the URL. Step 4-5 add cookie forwarding via server functions.                                                                |
| TanStack Start breaking changes       | Pin exact version. The post-Vinxi API (pure Vite plugin) is more stable.                                                                   |
| PWA + SSR conflicts                   | PWA is `selfDestroying` (deregistering). Test at Step 6f.                                                                                  |
| better-auth cookie forwarding         | Step 4 handles explicitly via `getRequest()`.                                                                                              |
| Vite 8 / Rolldown compatibility       | Confirmed compatible. `@tanstack/react-start` requires `vite >= 7.0.0`. Known beta bugs are fixed. Ensure `@vitejs/plugin-react >= 5.0.3`. |
| SSR memory usage                      | Constrain with `BUN_JSC_maxHeapSize` and Docker memory limits. Streaming reduces peak memory.                                              |
| CSP blocks hydration scripts          | `'unsafe-inline'` added to `script-src` in nginx CSP.                                                                                      |
| Slow API makes SSR slow               | `proxy_read_timeout 30s` in nginx. Client falls back gracefully.                                                                           |
| Card images serving                   | nginx serves static files directly, not through the SSR server.                                                                            |
| Display preference flash              | Theme is SSR-safe (cookies). Other prefs have negligible visual impact on first render.                                                    |

---

## What Stays the Same

- **Hono API server** - untouched
- **All route files** - structure is identical (TanStack Router to Start is
  additive)
- **All components** - no changes needed (except `__root.tsx` shell)
- **TanStack Query usage** - `useSuspenseQuery`, `queryOptions` patterns all
  preserved
- **packages/shared** - untouched
- **Database, auth server, cron jobs** - untouched
- **Zustand stores** - work as-is (theme via cookies, display via localStorage)
- **nuqs** - adapter already targets TanStack Router, works with Start

---

## Summary

| Step | What                                 | Risk          | Can stop here?              |
| ---- | ------------------------------------ | ------------- | --------------------------- |
| 0    | Prerequisites (SSR-safety, versions) | Low           | Yes (still a SPA)           |
| 1    | Add Start deps, update vite config   | Medium        | Yes (SPA with new build)    |
| 2    | Entry points + router factory        | Medium        | Yes (client-rendered Start) |
| 3    | Enable streaming SSR                 | High          | **Yes (working SSR app)**   |
| 4    | Server-side auth                     | Medium        | Yes (SSR + auth)            |
| 5    | Convert data fetching (incremental)  | Low per route | Yes (at any point)          |
| 6    | Update deployment                    | High          | No (must complete for prod) |
| 7    | Cleanup                              | Low           | Yes                         |
| 8    | Server-side cache for public data    | Low           | Yes (optimization)          |

Steps 0-3 are the core migration. Step 4 is critical for auth-protected routes.
Step 5 is incremental. Step 6 is required for production. Step 8 is a
performance optimization. You could stop after Step 3 and already have a working
SSR app in development.
