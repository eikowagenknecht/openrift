import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { lazy } from "react";

import { Analytics } from "@/components/analytics";
import { RouteNotFoundFallback } from "@/components/error-message";
import { Toaster } from "@/components/ui/sonner";
import { PROD } from "@/lib/env";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { siteSettingsQueryOptions } from "@/lib/site-settings";
import { getServerThemeClass } from "@/lib/theme-ssr.server";

// Import CSS as a URL for the head() function (Vite resolves this at build time)
import indexCss from "@/index.css?url";

const TanStackRouterDevtools = PROD
  ? () => null
  : lazy(async () => {
      const mod = await import("@tanstack/react-router-devtools");
      return { default: mod.TanStackRouterDevtools };
    });

/**
 * Returns the SSR theme class ("dark" or "") to prevent flash of wrong theme.
 * On the client, returns "" (Zustand hydrates the theme from the cookie).
 * On the server, reads the theme cookie from the incoming request.
 *
 * @returns The CSS class to apply to the `<html>` element.
 */
const getThemeClass = createIsomorphicFn()
  .client(() => "")
  .server(() => getServerThemeClass());

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      // oxlint-disable-next-line unicorn/text-encoding-identifier-case -- HTML charset attribute requires "utf-8"
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "description", content: "Built with Fury. Maintained with Calm." },
      { name: "theme-color", content: "#1d1538" },
      { name: "impact-site-verification", content: "5a360cf2-9e98-4886-8c05-4e2e1a39ce0e" },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon-64x64.png" },
      { rel: "icon", type: "image/webp", href: "/logo.webp" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon-180x180.png" },
      { rel: "stylesheet", href: indexCss },
    ],
  }),
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
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const themeClass = getThemeClass();

  return (
    <html lang="en" className={themeClass}>
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
