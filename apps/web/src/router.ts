import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { RouterErrorFallback } from "./components/error-fallback";
import { NotFoundFallback } from "./components/error-message";
import { createQueryClient } from "./lib/query-client";
import { initVersionStaleNavigationReload } from "./lib/stale-bundle-reload";
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

  // Dynamic import so the SSR bundle never statically resolves browser-only
  // Sentry exports. Server Sentry bootstraps separately via instrument.server.mjs.
  if (!router.isServer) {
    void (async () => {
      const { initClientSentry } = await import("./lib/sentry-client");
      initClientSentry(router);
    })();
    initVersionStaleNavigationReload(router);
  }

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }

  interface StaticDataRouteOption {
    hideFooter?: boolean;
  }
}
