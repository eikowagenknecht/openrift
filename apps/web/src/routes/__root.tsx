import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { lazy, useEffect } from "react";

import { RouterNotFoundFallback } from "@/components/error-fallback";
import { Footer } from "@/components/layout/footer";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { Toaster } from "@/components/ui/sonner";
import { SWUpdateProvider } from "@/hooks/use-sw-update";
import { PROD } from "@/lib/env";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { preventIOSOverscroll } from "@/lib/ios-overscroll-prevention";
import { fetchSession, getThemeFromCookie } from "@/lib/server-fns";

const TanStackRouterDevtools = PROD
  ? () => null
  : lazy(async () => {
      const mod = await import("@tanstack/react-router-devtools");
      return { default: mod.TanStackRouterDevtools };
    });

interface RootContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RootContext>()({
  beforeLoad: async ({ context }) => {
    const [, session, theme] = await Promise.all([
      context.queryClient.ensureQueryData(featureFlagsQueryOptions),
      fetchSession(),
      getThemeFromCookie(),
    ]);

    context.queryClient.setQueryData(["session"], session);

    return { session, theme };
  },
  head: () => ({
    meta: [
      { charSet: "utf8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "OpenRift" },
      { name: "description", content: "Fast. Open. Ad-free. A Riftbound companion." },
      { name: "theme-color", content: "#1d1538" },
    ],
    links: [
      { rel: "preconnect", href: "https://cmsassets.rgpub.io" },
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon-64x64.png" },
      { rel: "icon", type: "image/webp", href: "/logo.webp" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon-180x180.png" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: RouterNotFoundFallback,
});

function RootComponent() {
  const { theme } = Route.useRouteContext();

  useEffect(() => {
    preventIOSOverscroll();
  }, []);

  return (
    <html lang="en" className={theme === "dark" ? "dark" : undefined}>
      <head>
        <HeadContent />
      </head>
      <body>
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
        <Scripts />
      </body>
    </html>
  );
}
