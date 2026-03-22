import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { lazy } from "react";

import { RouterNotFoundFallback } from "@/components/error-fallback";
import { Footer } from "@/components/layout/footer";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { Toaster } from "@/components/ui/sonner";
import { SWUpdateProvider } from "@/hooks/use-sw-update";
import { PROD } from "@/lib/env";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";

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
    await context.queryClient.ensureQueryData(featureFlagsQueryOptions);
  },
  component: RootComponent,
  notFoundComponent: RouterNotFoundFallback,
});

function RootComponent() {
  return (
    <NuqsAdapter>
      <SWUpdateProvider>
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <Outlet />
          <Footer />
          <Toaster position="bottom-right" />
          <OfflineIndicator />
        </div>
        <TanStackRouterDevtools />
      </SWUpdateProvider>
    </NuqsAdapter>
  );
}
