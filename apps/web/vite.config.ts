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
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import Sonda from "sonda/vite";
import type { Plugin } from "vite";
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
    server.middlewares.use("/media", (req, res, next) => {
      const filePath = path.join(mediaDir, req.url?.split("?")[0] ?? "");
      if (!existsSync(filePath)) {
        return next();
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
    loc?: { start?: { line: number; column: number } } | null;
  };
}

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
      serveMediaPlugin,
      tailwindcss(),
      tanstackStart(),
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
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                test: /node_modules\/react-dom/,
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
                test: /node_modules\/@tanstack\/(react-query|query-core)/,
                name: "tanstack-query",
              },
              {
                test: /node_modules\/@tanstack\/(react-router|router-core)/,
                name: "tanstack-router",
              },
              {
                test: /node_modules\/@tanstack\/(db|react-db|query-db-collection)/,
                name: "tanstack-db",
              },
              {
                test: /node_modules\/(better-auth|@better-auth)/,
                name: "better-auth",
              },
              {
                test: /node_modules\/(@base-ui|@floating-ui)/,
                name: "base-ui",
              },
              {
                test: /node_modules\/sonner/,
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
      // Proxy /api/auth (better-auth browser client) and /api/v1/* (direct
      // client fetches for endpoints we want CF to edge-cache, e.g. the
      // catalog in use-cards.ts) to the API server. In production, nginx
      // handles all /api/* (see nginx/web.conf location /api/).
      proxy: {
        "/api/auth": { target: apiProxyTarget },
        "/api/v1": { target: apiProxyTarget },
      },
    },
  };
});
