import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { lazy } from "react";

import { Analytics } from "@/components/analytics";
import { RouteNotFoundFallback } from "@/components/error-message";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/ui/sonner";
import { PROD } from "@/lib/env";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { siteSettingsQueryOptions } from "@/lib/site-settings";

const TanStackRouterDevtools = PROD
  ? () => null
  : lazy(async () => {
      const mod = await import("@tanstack/react-router-devtools");
      return { default: mod.TanStackRouterDevtools };
    });

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  beforeLoad: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(featureFlagsQueryOptions);
    } catch {
      // Feature flags are non-critical — seed cache with empty defaults so
      // useSuspenseQuery in components doesn't re-throw the cached error.
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
});

function RootComponent() {
  return (
    <NuqsAdapter>
      <div className="bg-background text-foreground flex min-h-screen flex-col">
        <Outlet />
        <Footer />
        <Toaster position="bottom-right" />
      </div>
      <Analytics />
      <TanStackRouterDevtools />
    </NuqsAdapter>
  );
}
