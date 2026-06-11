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

  // Client-only init via dynamic import so the SSR bundle never statically
  // resolves browser-only Sentry exports. Server Sentry bootstraps separately
  // via apps/web/instrument.server.mjs.
  if (!router.isServer) {
    void (async () => {
      const { initClientSentry } = await import("./lib/sentry-client");
      initClientSentry(router);
    })();
    // Soft bundle-staleness (X-Build-Id mismatch) surfaces as a toast rather
    // than an instant reload; this reloads on the next navigation for users who
    // don't tap it. Dynamic import keeps stale-bundle (and sonner) out of the
    // SSR bundle — it resolves to the same module instance the client entry
    // inits, so the navigation handler reads the flag the fetch watcher sets.
    void (async () => {
      const { initVersionStaleNavigationReload } = await import("./lib/stale-bundle");
      initVersionStaleNavigationReload(router);
    })();
  }

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
