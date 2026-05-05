import interLatinWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { pacerDevtoolsPlugin } from "@tanstack/react-pacer-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

import { Analytics } from "@/components/analytics";
import { RouteNotFoundFallback } from "@/components/error-message";
// Side-effect import: installs a dev-only stack-dumper for React Compiler
// useMemoCache size-mismatch warnings. Body is `if (DEV)` so the block is
// stripped from production bundles.
// oxlint-disable-next-line import/no-unassigned-import -- side-effect tracer
import "@/lib/debug/memo-cache-trace";
import { Toaster } from "@/components/ui/sonner";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { runtimeConfigScript } from "@/lib/runtime-config";
import { organizationJsonLd } from "@/lib/seo";
import { getIsPreview, getSiteUrl } from "@/lib/site-config";
import { siteSettingsQueryOptions } from "@/lib/site-settings";

// CSS ?url import causes a harmless hydration warning in dev (Vite appends
// ?t=<timestamp> on the client). No effect in production.
import indexCss from "@/index.css?url";

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

// Reads the Sentry DSN from the server environment so it can be inlined into
// the SSR shell on `globalThis.__OPENRIFT_CONFIG__` and picked up by the
// browser SDK before hydration.
const getServerSentryDsn = createServerFn({ method: "GET" }).handler(
  (): string => process.env.SENTRY_DSN_SSR ?? "",
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
        { title: "OpenRift — Riftbound Card Collection Browser" },
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#1d1538" },
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
          href: interLatinWoff2,
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
              sameAs: ["https://github.com/openriftapp/openrift", "https://discord.gg/Qb6RcjXq6z"],
            }),
          ],
    };
  },
  beforeLoad: async ({ context }) => {
    const [resolvedTheme, sentryDsn] = await Promise.all([
      getServerTheme(),
      getServerSentryDsn(),
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
    return { resolvedTheme, sentryDsn };
  },
  component: RootComponent,
  notFoundComponent: RouteNotFoundFallback,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { resolvedTheme, sentryDsn } = Route.useRouteContext();
  const { data: siteSettings } = useSuspenseQuery(siteSettingsQueryOptions);
  const umamiOrigin = safeOrigin(siteSettings["umami-url"]);

  return (
    // suppressHydrationWarning: the blocking script below may adjust the class
    // for "auto" theme users whose OS prefers dark mode. The server defaults
    // "auto" to "light" since it can't check matchMedia.
    <html lang="en" className={resolvedTheme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <head>
        {/* No crossOrigin: Umami's script.js loads as a non-CORS <script>. */}
        {umamiOrigin && <link rel="preconnect" href={umamiOrigin} />}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: runtimeConfigScript(sentryDsn) }} />
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
  return (
    <>
      <div className="bg-background text-foreground flex min-h-screen flex-col">
        <Outlet />
        <Toaster position="bottom-right" />
      </div>
      {!import.meta.env.VITE_DISABLE_DEVTOOLS && (
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
            pacerDevtoolsPlugin(),
          ]}
        />
      )}
      <Analytics />
    </>
  );
}
