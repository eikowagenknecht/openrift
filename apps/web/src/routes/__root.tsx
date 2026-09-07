import hankenGroteskLatinWoff2 from "@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2?url";
import type { Palette } from "@openrift/shared";
import type { AppEnv } from "@openrift/shared/app-env";
import { parseAppEnv } from "@openrift/shared/app-env";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { lazy, Suspense } from "react";

import { Analytics } from "@/components/analytics";
import { RouteNotFoundFallback } from "@/components/error-message";
import { Toaster } from "@/components/ui/sonner";
// Installs a dev-only stack-dumper for React Compiler useMemoCache size-mismatch
// warnings; body is `if (DEV)` so it's stripped from production bundles.
// oxlint-disable-next-line import/no-unassigned-import -- side-effect tracer
import "@/lib/debug/memo-cache-trace";
import { ResolvedViewPrefsProvider } from "@/hooks/use-view-prefs";
import { sessionQueryOptions } from "@/lib/auth-session";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { runtimeConfigScript } from "@/lib/runtime-config";
import { organizationJsonLd } from "@/lib/seo";
import {
  readClientCookie,
  resolvePaletteFromCookie,
  resolveThemeFromCookie,
} from "@/lib/shell-prefs";
import { getIsPreview, getSiteUrl } from "@/lib/site-config";
import { siteSettingsQueryOptions } from "@/lib/site-settings";
import { SOCIAL_LINKS } from "@/lib/social-links";
import type { CookieViewSurface, ViewPrefsBlob } from "@/lib/view-prefs";
import { resolveViewPrefsFromCookie, VIEW_PREFS_COOKIE } from "@/lib/view-prefs";

// CSS ?url import causes a harmless hydration warning in dev (Vite appends
// ?t=<timestamp> on the client). No effect in production.
import indexCss from "@/index.css?url";

// pacer-devtools 0.14.0 runs Solid's client-only `template()` at module top
// level, so a static import crashes SSR module evaluation in dev.
const PacerDevtoolsPanel = lazy(async () => {
  const module = await import("@tanstack/react-pacer-devtools");
  return { default: module.PacerDevtoolsPanel };
});

// Only invoked during SSR; client navigations resolve the same cookie
// locally in beforeLoad.
const getServerTheme = createServerFn({ method: "GET" }).handler((): "light" | "dark" =>
  resolveThemeFromCookie(getCookie("theme")),
);

// Unknown values are clamped so untrusted cookie content never reaches the DOM.
// Only invoked during SSR, same as getServerTheme.
const getServerPalette = createServerFn({ method: "GET" }).handler((): Palette =>
  resolvePaletteFromCookie(getCookie("palette")),
);

// The SSR pass has no access to the Zustand store (document.cookie doesn't
// exist server-side), so the resolved value rides in route context instead.
const getServerViewPrefs = createServerFn({ method: "GET" }).handler(
  (): ViewPrefsBlob<CookieViewSurface> => resolveViewPrefsFromCookie(getCookie(VIEW_PREFS_COOKIE)),
);

const getServerSentryDsn = createServerFn({ method: "GET" }).handler(
  (): string => process.env.SENTRY_DSN_SSR ?? "",
);

const getServerAppEnv = createServerFn({ method: "GET" }).handler((): AppEnv =>
  parseAppEnv(process.env.APP_ENV),
);

function safeOrigin(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Blocking inline script: the server resolves "auto" as "light" since it can't
// check matchMedia. Must stay in sync with the cookie format in theme-store.ts.
const THEME_SCRIPT = [
  "(function(){try{",
  'var pref="dark";',
  String.raw`var m=document.cookie.match(/(?:^|;\s*)theme=([^;]*)/);`,
  "if(m){var p=JSON.parse(decodeURIComponent(m[1]));pref=p&&p.state&&p.state.preference||pref}",
  'if(pref==="dark"||pref==="auto"&&matchMedia("(prefers-color-scheme:dark)").matches)',
  'document.documentElement.classList.add("dark")',
  "}catch(e){}})()",
].join("");

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => {
    const isPreview = getIsPreview();
    return {
      meta: [
        { title: "OpenRift - Riftbound Card Collection Browser" },
        { charSet: "utf-8" },
        // viewport-fit=cover lets the app draw into the iOS safe areas; the
        // insets are reclaimed via env(safe-area-inset-*) in index.css.
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#1d1538" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "impact-site-verification", content: "5a360cf2-9e98-4886-8c05-4e2e1a39ce0e" },
        // Layer 1 of 3 (see also /robots.txt in server.ts and X-Robots-Tag in preview nginx).
        ...(isPreview
          ? [{ name: "robots", content: "noindex, nofollow" } as Record<string, string>]
          : []),
      ],
      links: [
        { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon-64x64.png" },
        { rel: "icon", type: "image/webp", href: "/logo.webp" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon-180x180.png" },
        // crossOrigin is required: browser font requests always go in CORS mode,
        // so without it the preload doesn't match the later CSS-driven request.
        {
          rel: "preload",
          as: "font",
          type: "font/woff2",
          href: hankenGroteskLatinWoff2,
          crossOrigin: "anonymous",
        },
        { rel: "stylesheet", href: indexCss },
      ],
      // Skipped on preview deploys so crawlers that ignore robots/noindex
      // still don't see structured data pointing at the preview origin.
      scripts: isPreview
        ? []
        : [
            organizationJsonLd(getSiteUrl(), {
              sameAs: [SOCIAL_LINKS.githubRepo, SOCIAL_LINKS.discordInvite],
            }),
          ],
    };
  },
  beforeLoad: async ({ context, location }) => {
    // Resolve the signed-in /cards redirect before prefetching feature-flags /
    // site-settings, so a pass whose response is immediately replaced isn't wasted.
    if (location.pathname === "/") {
      const session = await context.queryClient
        .query({ ...sessionQueryOptions(), staleTime: "static" })
        .catch(() => null);
      if (session?.user) {
        throw redirect({ to: "/cards" });
      }
    }
    const flagsReady = (async () => {
      try {
        await context.queryClient.query({ ...featureFlagsQueryOptions, staleTime: "static" });
      } catch {
        // Non-critical: seed with empty defaults so useSuspenseQuery in
        // components doesn't re-throw the cached error.
        context.queryClient.setQueryData(featureFlagsQueryOptions.queryKey, {});
      }
    })();
    const settingsReady = (async () => {
      try {
        await context.queryClient.query({ ...siteSettingsQueryOptions, staleTime: "static" });
      } catch {
        context.queryClient.setQueryData(siteSettingsQueryOptions.queryKey, {});
      }
    })();
    // beforeLoad re-runs on every navigation (including search-param-only ones)
    // and blocks until it resolves, so these three values must never go over
    // the network on the client.
    if (globalThis.window !== undefined) {
      const resolvedTheme = resolveThemeFromCookie(readClientCookie("theme"));
      const resolvedPalette = resolvePaletteFromCookie(readClientCookie("palette"));
      const resolvedViewPrefs = resolveViewPrefsFromCookie(readClientCookie(VIEW_PREFS_COOKIE));
      const sentryDsn = globalThis.__OPENRIFT_CONFIG__?.sentryDsn ?? "";
      const appEnv = parseAppEnv(globalThis.__OPENRIFT_CONFIG__?.appEnv);
      await Promise.all([flagsReady, settingsReady]);
      return { resolvedTheme, resolvedPalette, resolvedViewPrefs, sentryDsn, appEnv };
    }
    const [resolvedTheme, resolvedPalette, resolvedViewPrefs, sentryDsn, appEnv] =
      await Promise.all([
        getServerTheme(),
        getServerPalette(),
        getServerViewPrefs(),
        getServerSentryDsn(),
        getServerAppEnv(),
        flagsReady,
        settingsReady,
      ]);
    return { resolvedTheme, resolvedPalette, resolvedViewPrefs, sentryDsn, appEnv };
  },
  component: RootComponent,
  notFoundComponent: RouteNotFoundFallback,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, resolvedPalette, sentryDsn, appEnv } = Route.useRouteContext();
  const { data: siteSettings } = useSuspenseQuery(siteSettingsQueryOptions);
  const umamiOrigin = safeOrigin(siteSettings["umami-url"]);

  return (
    // suppressHydrationWarning: THEME_SCRIPT may adjust the class for "auto"
    // theme users whose OS prefers dark mode.
    <html
      lang="en"
      className={resolvedTheme === "dark" ? "dark" : ""}
      data-palette={resolvedPalette}
      suppressHydrationWarning
    >
      <head>
        {/* No crossOrigin: Umami's script.js loads as a non-CORS <script>. */}
        {umamiOrigin && <link rel="preconnect" href={umamiOrigin} />}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: runtimeConfigScript({ sentryDsn, appEnv }) }} />
        <HeadContent />
      </head>
      <body className="overflow-x-clip">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { resolvedViewPrefs } = Route.useRouteContext();
  return (
    <>
      {/* `isolate` scopes descendant z-indexes to this div so AppBackground's
          -z-10 layer paints above this background instead of behind it. */}
      <div className="bg-background text-foreground isolate flex min-h-screen flex-col">
        <ResolvedViewPrefsProvider value={resolvedViewPrefs}>
          <Outlet />
        </ResolvedViewPrefsProvider>
      </div>
      {/* Outside the isolate div: portalled sheets and dialogs sit at body level. */}
      <Toaster position="bottom-right" />
      {!import.meta.env.VITE_DISABLE_DEVTOOLS && (
        // Workaround for TanStack/devtools#444: devtools-vite 0.7.0 strips only
        // <TanStackDevtools>, leaving `&& ( )`; this wraps it into valid `<>{ }</>`.
        /* oxlint-disable react/jsx-no-useless-fragment, react/jsx-curly-brace-presence -- part of the workaround above */
        <>
          {
            <TanStackDevtools
              config={{
                position: "top-right",
              }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
                {
                  name: "Tanstack Query",
                  render: <ReactQueryDevtoolsPanel />,
                },
                {
                  name: "TanStack Pacer",
                  render: (
                    <Suspense fallback={null}>
                      <PacerDevtoolsPanel />
                    </Suspense>
                  ),
                },
              ]}
            />
          }
        </>
        /* oxlint-enable react/jsx-no-useless-fragment, react/jsx-curly-brace-presence */
      )}
      <Analytics />
    </>
  );
}
