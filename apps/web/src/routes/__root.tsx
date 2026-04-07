import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Scripts, createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { lazy } from "react";

import { Analytics } from "@/components/analytics";
import { RouteNotFoundFallback } from "@/components/error-message";
import { Toaster } from "@/components/ui/sonner";
import { PROD } from "@/lib/env";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { siteSettingsQueryOptions } from "@/lib/site-settings";

// CSS side-effect import — TanStack Start's entries don't go through main.tsx,
// so the stylesheet must be imported from the route tree.
// oxlint-disable-next-line import/no-unassigned-import -- CSS side-effect import
import "@/index.css";

const TanStackRouterDevtools = PROD
  ? () => null
  : lazy(async () => {
      const mod = await import("@tanstack/react-router-devtools");
      return { default: mod.TanStackRouterDevtools };
    });

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  shellComponent: RootShell,
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

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content="Built with Fury. Maintained with Calm." />
        <meta name="theme-color" content="#1d1538" />
        <meta name="impact-site-verification" content="5a360cf2-9e98-4886-8c05-4e2e1a39ce0e" />
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64x64.png" />
        <link rel="icon" type="image/webp" href="/logo.webp" />
        <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
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
