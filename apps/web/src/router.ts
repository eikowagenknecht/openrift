import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import qs from "query-string";

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
    parseSearch: parseSearchWith((value) => qs.parse(value, { arrayFormat: "comma" })),
    stringifySearch: stringifySearchWith((value) => qs.stringify(value, { arrayFormat: "comma" })),
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
