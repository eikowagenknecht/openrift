// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import { execSync } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import { createReadStream, existsSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import path from "node:path";

import babel from "@rolldown/plugin-babel";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import Sonda from "sonda/vite";
import type { Plugin, ViteDevServer } from "vite";
import { defineConfig, loadEnv } from "vite";

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();
const mediaDir = path.resolve(__dirname, "../../media");
const repoRoot = path.resolve(__dirname, "../..");

const MEDIA_MIME_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
};

// Serve /media/ from repo root in dev (in prod, nginx bind mount handles this)
const serveMediaPlugin: Plugin = {
  name: "serve-media",
  configureServer(server) {
    server.middlewares.use("/media", (req, res, _next) => {
      const filePath = path.join(mediaDir, req.url?.split("?")[0] ?? "");
      if (!existsSync(filePath)) {
        // Missing media must 404 here, NOT `next()`. Falling through hands the
        // request to the TanStack SSR router, which runs __root.beforeLoad
        // (a feature-flags fetch) and renders the notFound page through the
        // full SSR pipeline (~1s each) for every missing thumbnail — a storm of
        // SSR renders + API hits when the dev media dir is incompletely synced.
        // Prod never hits this: nginx serves /media and 404s missing files.
        res.statusCode = 404;
        res.end();
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader("Content-Type", MEDIA_MIME_TYPES[ext] ?? "application/octet-stream");
      createReadStream(filePath).pipe(res);
    });
  },
};

// Wraps `reactCompilerPreset()` with a logger so CompileError / CompileSkip /
// CompileDiagnostic / PipelineError events from babel-plugin-react-compiler
// surface in the dev-server terminal. The preset already sets rolldown filters
// and `optimizeDeps` hints we want to keep; this only rewrites the single
// `["babel-plugin-react-compiler", options]` plugin entry inside.
//
// Runs on the Vite server only (dev and build). Nothing from this logger ever
// reaches the client bundle. See docs: https://react.dev/reference/react-compiler/logger
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- preset is a structural type from @rolldown/plugin-babel
function withReactCompilerLogger(preset: any): any {
  const innerPreset = preset.preset;
  preset.preset = (...args: unknown[]) => {
    const result = innerPreset(...args);
    result.plugins = result.plugins.map((plugin: unknown) => {
      if (
        Array.isArray(plugin) &&
        typeof plugin[0] === "string" &&
        plugin[0].includes("react-compiler")
      ) {
        return [plugin[0], { ...(plugin[1] as object | undefined), logger: compilerLogger }];
      }
      return plugin;
    });
    return result;
  };
  return preset;
}

interface CompilerLoggerEvent {
  kind: string;
  reason?: string;
  detail?: {
    options?: { category?: string };
    loc?: { start?: { line: number; column: number } } | null;
  };
}

// React Compiler bails on memoizing the two virtualized card surfaces: their
// render path reads TanStack Virtual's `virtualizer` object directly
// (`virtualizer.containerRef`, `.getVirtualItems()`, `.measureElement`), which
// the compiler sees as ref access during render and flags under the `Refs`
// category. The bailout is intentional and required — we deliberately use
// `directDomUpdates: true` + `directDomUpdatesMode: "position"` (see the
// comments in card-grid.tsx / card-table.tsx) instead of a `"use no memo"`
// wrapper so the rest of each component still compiles. So these specific
// diagnostics are pure noise.
//
// We match on (file suffix, category) rather than the exact message so any
// *new* / unrelated compiler bailout in these files still surfaces. The scope
// is intentionally narrow: only the two files that own the virtualizer, only
// the `Refs` category (e.g. the unrelated `Refs` bailout in use-card-filters.ts
// is NOT suppressed).
//
// TODO: Remove this once TanStack Virtual exposes the virtualizer in a way
// React Compiler can analyze without a ref-during-render bailout
// (track: https://github.com/TanStack/virtual). Drop the matching entries (or
// the whole list) and the `Refs` events will reappear, confirming the fix.
const SUPPRESSED_COMPILER_BAILOUTS: { fileSuffix: string; category: string }[] = [
  { fileSuffix: "components/cards/card-grid.tsx", category: "Refs" },
  { fileSuffix: "components/cards/card-table.tsx", category: "Refs" },
];

const compilerLogger = {
  logEvent(filename: string | null, event: CompilerLoggerEvent): void {
    if (
      event.kind !== "CompileError" &&
      event.kind !== "CompileSkip" &&
      event.kind !== "CompileDiagnostic" &&
      event.kind !== "PipelineError"
    ) {
      return;
    }
    const category = event.detail?.options?.category;
    if (
      filename &&
      category &&
      SUPPRESSED_COMPILER_BAILOUTS.some(
        (entry) => filename.endsWith(entry.fileSuffix) && entry.category === category,
      )
    ) {
      return;
    }
    const short = filename ? filename.split("/").slice(-3).join("/") : "?";
    const loc = event.detail?.loc?.start;
    const at = loc ? `:${loc.line}:${loc.column}` : "";
    // oxlint-disable no-console -- dev-only diagnostic printed to server terminal
    console.log(`[react-compiler] ${event.kind} ${short}${at}`);
    if (event.detail) {
      // `console.dir` with unlimited depth surfaces `suggestions`, nested
      // `details`, and `SourceLocation` objects that `console.log`'s default
      // depth=2 would truncate as "[Object]".
      console.dir(event.detail, { depth: null, colors: true });
    }
    // oxlint-enable no-console
  },
};

// Sentry plugin: auto-instruments TanStack Start middlewares and uploads
// source maps when SENTRY_AUTH_TOKEN is set. The plugin internally disables
// source-map upload (but keeps middleware auto-instrumentation) when the
// auth token is absent, so this is safe to include in local/dev builds.
// We keep the .map files in the output after upload so they're served alongside
// the JS — OpenRift is open source, and shipping maps lets Lighthouse pass and
// makes browser devtools debugging nicer.
const sentryPlugins = sentryTanstackStart({
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: { name: commitHash },
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});

export default defineConfig(({ mode, command }) => {
  // Load .env from the monorepo root into process.env so SSR code can access
  // server-only vars like API_INTERNAL_URL at runtime (not baked into the bundle).
  const env = loadEnv(mode, repoRoot, "");
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:3000";

  return {
    define: {
      __COMMIT_HASH__: JSON.stringify(commitHash),
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      // Needs to be first. Skipped under e2e — the console-pipe SSE channel
      // keeps the network "busy" forever, which breaks Playwright's
      // networkidle wait during global-setup warmup.
      ...(process.env.VITE_DISABLE_DEVTOOLS ? [] : [devtools()]),
      // HTTPS for the dev server, on by default (`bun run dev` sets DEV_HTTPS):
      // getUserMedia needs a secure context, so testing the card scanner's live
      // camera from a phone requires it. Self-signed — the phone shows a
      // certificate warning once, and the page is a secure context after
      // accepting it. `bun run dev:http` opts out for e2e, curl checks and any
      // other flow that can't take a self-signed cert.
      // It only configures server.https, so its position is not sensitive.
      ...(process.env.DEV_HTTPS
        ? [
            basicSsl(),
            // Cross-origin isolation unlocks SharedArrayBuffer, which
            // onnxruntime needs for multi-threaded WASM (the scanner's encoder
            // is ~4x slower single-threaded). A middleware rather than
            // `server.headers` because the SSR document is served by the Start
            // plugin, not vite's static middleware, and isolation is decided
            // by the document's headers. It rides on the same flag as TLS, so
            // everyday `bun run dev` is cross-origin isolated too. COEP blocks
            // any cross-origin subresource lacking CORP/CORS, so a dev flow
            // that needs one has to use `bun run dev:http`.
            {
              name: "dev-cross-origin-isolation",
              configureServer(server: ViteDevServer) {
                server.middlewares.use((_req, res, next) => {
                  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
                  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
                  next();
                });
              },
            },
          ]
        : []),
      serveMediaPlugin,
      tailwindcss(),
      tanstackStart({
        router: {
          // Skip colocated vitest files in routes/; they don't export a Route.
          routeFileIgnorePattern: "\\.test\\.",
        },
      }),
      // Only enable Nitro for production builds — in dev it caches stale SSR
      // HTML after HMR updates, causing hydration mismatches.
      // See https://github.com/TanStack/router/issues/6556
      command === "build" &&
        nitro({
          preset: "bun",
          // Opt-in via `bun run start:lh` (COMPRESS=1) so local Lighthouse runs
          // see realistic transfer sizes. Off by default — prod is fronted by
          // Cloudflare/nginx, which already compresses responses.
          compressPublicAssets: process.env.COMPRESS ? { gzip: true, brotli: true } : false,
        }),
      viteReact(),
      babel({
        presets: [withReactCompilerLogger(reactCompilerPreset())],
      }),
      ...sentryPlugins,
      // Bundle treemap. Opt-in via `bun run analyze` (ANALYZE=1) to avoid the
      // ~few-second post-build overhead on every prod build. Writes the report
      // to apps/web/.sonda/.
      ...(process.env.ANALYZE
        ? [
            Sonda({
              open: false,
              gzip: true,
              brotli: true,
              deep: true,
              sources: true,
            }),
          ]
        : []),
    ],
    build: {
      target: "es2024",
      sourcemap: true,
      // Never inline fonts as base64 data: URIs. Small @fontsource subsets fall
      // below the default 4 KB assetsInlineLimit and get inlined, which the
      // production CSP (`font-src 'self'`) then blocks because it forbids the
      // data: scheme. Keeping fonts as same-origin files satisfies the policy.
      assetsInlineLimit: (filePath: string) => !/\.(?:woff2?|ttf|otf|eot)$/u.test(filePath),
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                test: /node_modules\/react-dom/u,
                name: "react-dom",
              },
              // tanstack-query must come before tanstack-db: query-core
              // utilities (focusManager, onlineManager, subscribable…) are
              // depended on by both @tanstack/react-query (loaded everywhere)
              // and @tanstack/db. If db's group wins first, query-core gets
              // pulled into the tanstack-db chunk and tanstack-router/query
              // import from it, dragging tanstack-db into routes that don't
              // actually use it (like the public homepage).
              {
                test: /node_modules\/@tanstack\/(?:react-query|query-core)/u,
                name: "tanstack-query",
              },
              {
                test: /node_modules\/@tanstack\/(?:react-router|router-core)/u,
                name: "tanstack-router",
              },
              {
                test: /node_modules\/@tanstack\/(?:db|react-db|query-db-collection)/u,
                name: "tanstack-db",
              },
              {
                test: /node_modules\/(?:better-auth|@better-auth)/u,
                name: "better-auth",
              },
              {
                test: /node_modules\/(?:@base-ui|@floating-ui)/u,
                name: "base-ui",
              },
              {
                test: /node_modules\/sonner/u,
                name: "sonner",
              },
            ],
          },
        },
      },
    },
    server: {
      host: true,
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      strictPort: Boolean(process.env.PORT),
      // Proxy /api/auth (better-auth browser client), /api/v1/* (direct
      // client fetches for endpoints we want CF to edge-cache, e.g. the
      // catalog in use-cards.ts), /api/health (used by
      // initVisibilityVersionCheck to refresh X-Build-Id on idle tabs), and
      // /api/doc + /api/ui (OpenAPI spec and Swagger UI, linked from
      // /developers) to the API server. In production, nginx handles all
      // /api/* (see nginx/web.conf location /api/).
      proxy: {
        "/api/auth": { target: apiProxyTarget },
        "/api/v1": { target: apiProxyTarget },
        "/api/health": { target: apiProxyTarget },
        "/api/doc": { target: apiProxyTarget },
        "/api/ui": { target: apiProxyTarget },
      },
    },
  };
});
