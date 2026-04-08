import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { lazy } from "react";

import { Analytics } from "@/components/analytics";
import { RouteNotFoundFallback } from "@/components/error-message";
import { Toaster } from "@/components/ui/sonner";
import { PROD } from "@/lib/env";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { siteSettingsQueryOptions } from "@/lib/site-settings";

// CSS ?url import causes a harmless hydration warning in dev (Vite appends
// ?t=<timestamp> on the client). No effect in production.
import indexCss from "@/index.css?url";

const TanStackRouterDevtools = PROD
  ? () => null
  : lazy(async () => {
      const mod = await import("@tanstack/react-router-devtools");
      return { default: mod.TanStackRouterDevtools };
    });

// Server function that reads the theme cookie and resolves it to "light" or
// "dark". Returns the resolved theme so `shellComponent` can apply the correct
// class to <html> on the very first byte (no FOUC).
const getServerTheme = createServerFn({ method: "GET" }).handler((): "light" | "dark" => {
  const raw = getCookie("theme");
  if (!raw) {
    return "light";
  }
  try {
    const parsed = JSON.parse(raw);
    const preference: string | undefined = parsed?.state?.preference;
    if (preference === "dark") {
      return "dark";
    }
    // "auto" or missing preference — server can't check matchMedia, default
    // to "light". The client-side blocking script below corrects this if the
    // user's OS prefers dark mode.
    return "light";
  } catch {
    return "light";
  }
});

// Blocking inline script that applies the correct theme before first paint.
// The server resolves "auto" as "light" since it can't check matchMedia; this
// script corrects it using the browser's actual preference. When there is no
// cookie (first-time visitors), the default preference is "auto", so we still
// need to check matchMedia. Must stay in sync with the cookie format in
// theme-store.ts / cookie-storage.ts.
const THEME_SCRIPT = [
  "(function(){try{",
  'var pref="auto";',
  String.raw`var m=document.cookie.match(/(?:^|;\s*)theme=([^;]*)/);`,
  "if(m){var p=JSON.parse(decodeURIComponent(m[1]));pref=p&&p.state&&p.state.preference||pref}",
  'if(pref==="dark"||(pref==="auto"||!pref)&&matchMedia("(prefers-color-scheme:dark)").matches)',
  'document.documentElement.classList.add("dark")',
  "}catch(e){}})()",
].join("");

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { title: "OpenRift — Riftbound Card Collection Browser" },
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
    const [resolvedTheme] = await Promise.all([
      getServerTheme(),
      (async () => {
        try {
          await context.queryClient.ensureQueryData(featureFlagsQueryOptions);
        } catch {
          // Feature flags are non-critical — seed cache with empty defaults so
          // useSuspenseQuery in components doesn't re-throw the cached error.
          context.queryClient.setQueryData(featureFlagsQueryOptions.queryKey, {});
        }
      })(),
      (async () => {
        try {
          await context.queryClient.ensureQueryData(siteSettingsQueryOptions);
        } catch {
          context.queryClient.setQueryData(siteSettingsQueryOptions.queryKey, {});
        }
      })(),
    ]);
    return { resolvedTheme };
  },
  component: RootComponent,
  notFoundComponent: RouteNotFoundFallback,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = Route.useRouteContext();

  return (
    // suppressHydrationWarning: the blocking script below may adjust the class
    // for "auto" theme users whose OS prefers dark mode. The server defaults
    // "auto" to "light" since it can't check matchMedia.
    <html lang="en" className={resolvedTheme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
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
