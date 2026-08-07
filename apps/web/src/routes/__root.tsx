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
// Side-effect import: installs a dev-only stack-dumper for React Compiler
// useMemoCache size-mismatch warnings. Body is `if (DEV)` so the block is
// stripped from production bundles.
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

// Client-only lazy import: pacer-devtools 0.14.0 runs Solid's client-only
// `template()` at module top level, so a static import crashes SSR module
// evaluation in dev. The lazy component defers the import to the browser,
// where the panel actually mounts.
const PacerDevtoolsPanel = lazy(async () => {
  const module = await import("@tanstack/react-pacer-devtools");
  return { default: module.PacerDevtoolsPanel };
});

// Server function that reads the theme cookie and resolves it to "light" or
// "dark". Returns the resolved theme so `shellComponent` can apply the correct
// class to <html> on the very first byte (no FOUC). Only invoked during SSR —
// client navigations resolve the same cookie locally in beforeLoad.
const getServerTheme = createServerFn({ method: "GET" }).handler((): "light" | "dark" =>
  resolveThemeFromCookie(getCookie("theme")),
);

// Server function that reads the palette cookie. The cookie may not exist
// (first-time visitors) — default to PREFERENCE_DEFAULTS.palette. Unknown
// values are clamped so untrusted cookie content never reaches the DOM.
// Only invoked during SSR, same as getServerTheme.
const getServerPalette = createServerFn({ method: "GET" }).handler((): Palette =>
  resolvePaletteFromCookie(getCookie("palette")),
);

// Server function that reads the per-surface sort/group cookie. The SSR pass
// has no access to the Zustand store (it hydrates from document.cookie, which
// doesn't exist server-side), so the resolved value rides in route context and
// supplies the default for /cards and /promos. Both sides read the same cookie,
// so the server HTML and the hydrated grid agree. Only invoked during SSR.
const getServerViewPrefs = createServerFn({ method: "GET" }).handler(
  (): ViewPrefsBlob<CookieViewSurface> => resolveViewPrefsFromCookie(getCookie(VIEW_PREFS_COOKIE)),
);

// Reads the Sentry DSN from the server environment so it can be inlined into
// the SSR shell on `globalThis.__OPENRIFT_CONFIG__` and picked up by the
// browser SDK before hydration.
const getServerSentryDsn = createServerFn({ method: "GET" }).handler(
  (): string => process.env.SENTRY_DSN_SSR ?? "",
);

// Reads the deployment environment from the server so it can be inlined into
// the SSR shell alongside the DSN. The browser SDK reports this verbatim to
// Sentry, keeping preview errors out of the production environment.
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
  head: () => {
    const isPreview = getIsPreview();
    return {
      meta: [
        { title: "OpenRift - Riftbound Card Collection Browser" },
        { charSet: "utf-8" },
        // viewport-fit=cover lets the app draw into the iOS safe areas (behind
        // the Dynamic Island / notch and rounded corners) so the header's blur
        // can extend up there instead of iOS painting a solid theme-color band.
        // The insets are then reclaimed via env(safe-area-inset-*) in index.css
        // and on the sticky header.
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#1d1538" },
        // Standalone iOS PWA: draw web content under a translucent status bar so
        // the safe-area handling above takes effect instead of an opaque strip.
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "impact-site-verification", content: "5a360cf2-9e98-4886-8c05-4e2e1a39ce0e" },
        // Preview deploys must never be indexed. Layer 1 of 3 (see also
        // /robots.txt in server.ts and X-Robots-Tag in preview nginx).
        ...(isPreview
          ? [{ name: "robots", content: "noindex, nofollow" } as Record<string, string>]
          : []),
      ],
      links: [
        { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon-64x64.png" },
        { rel: "icon", type: "image/webp", href: "/logo.webp" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon-180x180.png" },
        // Preload the Latin Inter face so the browser fetches it in parallel
        // with the stylesheet instead of waiting to discover the URL inside the
        // parsed CSS. crossOrigin is required: browser font requests always go
        // in CORS mode, so without it the preload doesn't match the later CSS-
        // driven request and ends up unused.
        {
          rel: "preload",
          as: "font",
          type: "font/woff2",
          href: hankenGroteskLatinWoff2,
          crossOrigin: "anonymous",
        },
        { rel: "stylesheet", href: indexCss },
      ],
      // Site-wide Organization JSON-LD. Skipped on preview deploys so
      // crawlers that ignore robots/noindex still don't see structured data
      // pointing at the preview origin.
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
    // The signed-in landing path is /cards. Resolve that redirect *before*
    // prefetching feature-flags / site-settings so we don't waste a fetch on
    // a pass whose response is immediately replaced by a 3xx. The follow-up
    // request to /cards re-runs root.beforeLoad with a fresh QueryClient,
    // and that pass picks up the prefetches.
    if (location.pathname === "/") {
      const session = await context.queryClient
        .ensureQueryData(sessionQueryOptions())
        .catch(() => null);
      if (session?.user) {
        throw redirect({ to: "/cards" });
      }
    }
    const flagsReady = (async () => {
      try {
        await context.queryClient.ensureQueryData(featureFlagsQueryOptions);
      } catch {
        // Feature flags are non-critical — seed cache with empty defaults so
        // useSuspenseQuery in components doesn't re-throw the cached error.
        context.queryClient.setQueryData(featureFlagsQueryOptions.queryKey, {});
      }
    })();
    const settingsReady = (async () => {
      try {
        await context.queryClient.ensureQueryData(siteSettingsQueryOptions);
      } catch {
        context.queryClient.setQueryData(siteSettingsQueryOptions.queryKey, {});
      }
    })();
    // beforeLoad re-runs on EVERY navigation, including search-param-only
    // ones (filter clicks, search-as-you-type) and intent preloads, and the
    // navigation blocks until it resolves. The three shell values must
    // therefore never go over the network on the client — the browser
    // already has the theme/palette cookies and the SSR-inlined runtime
    // config, while a round trip here stalls every interaction by the full
    // client→server latency (multi-second freezes on slow connections).
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
    // suppressHydrationWarning: the blocking script below may adjust the class
    // for "auto" theme users whose OS prefers dark mode. The server defaults
    // "auto" to "light" since it can't check matchMedia.
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
        {/* Per-surface sort/group defaults, resolved from the request cookie so
            the server HTML matches what the hydrated grid will render. */}
        <ResolvedViewPrefsProvider value={resolvedViewPrefs}>
          <Outlet />
        </ResolvedViewPrefsProvider>
        <Toaster position="bottom-right" />
      </div>
      {!import.meta.env.VITE_DISABLE_DEVTOOLS && (
        // Deliberate workaround for https://github.com/TanStack/devtools/issues/444:
        // devtools-vite 0.7.0 strips only the <TanStackDevtools> element from
        // production builds, which would leave `&& ( )` — a syntax error. With
        // the extra fragment + expression container the leftover is a valid
        // `<>{ }</>`. Do not "simplify" this away while on 0.7.x.
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
