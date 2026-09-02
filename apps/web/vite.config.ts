// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import { execSync } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import { createReadStream, existsSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import path from "node:path";

import type { RolldownBabelPreset } from "@rolldown/plugin-babel";
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
const mediaDir = path.resolve(import.meta.dirname, "../../media");
const repoRoot = path.resolve(import.meta.dirname, "../..");

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
function withReactCompilerLogger(preset: RolldownBabelPreset): RolldownBabelPreset {
  // `PresetItem` covers every shape babel accepts. This one is a factory.
  const innerPreset = preset.preset as (...args: unknown[]) => { plugins: unknown[] };
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
    options?: { reason?: string; category?: string };
  };
}

// Files React Compiler is allowed to bail on, keyed by path relative to
// apps/web. Every other bailout fails the build (see reactCompilerBailoutGuard).
// Keep the reason with the entry, and delete the entry once the cause is gone.
const ALLOWED_COMPILER_BAILOUTS: Record<string, string> = {
  "src/lib/virtualizer-fresh.ts":
    'CompileSkip: carries "use no memo" on purpose (TanStack/virtual#736)',
};

// Unexpected bailouts seen so far in this build, keyed the same way.
const compilerBailouts = new Map<string, string>();

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
    const relative = filename ? path.relative(import.meta.dirname, filename) : "?";
    const loc = event.detail?.loc?.start;
    const at = loc ? `:${loc.line}:${loc.column}` : "";
    if (!(relative in ALLOWED_COMPILER_BAILOUTS)) {
      const reason = event.detail?.options?.reason ?? event.reason ?? "no reason given";
      compilerBailouts.set(relative, `${event.kind}${at}: ${reason}`);
    }
    // oxlint-disable no-console -- diagnostic printed to the server terminal
    console.log(`[react-compiler] ${event.kind} ${relative}${at}`);
    if (event.detail) {
      // `console.dir` with unlimited depth surfaces `suggestions`, nested
      // `details`, and `SourceLocation` objects that `console.log`'s default
      // depth=2 would truncate as "[Object]".
      console.dir(event.detail, { depth: null, colors: true });
    }
    // oxlint-enable no-console
  },
};

// A bailed-out file ships uncompiled: no memoization, and the re-render bugs
// the compiler was papering over come back. Nothing else in the toolchain
// reports it — the eslint react-compiler rule stays silent on these "Todo"
// bailouts, and the build otherwise succeeds — so the only thing standing
// between a bailout and production is this check. Build only: dev keeps
// running and just prints the diagnostic above.
const reactCompilerBailoutGuard: Plugin = {
  name: "react-compiler-bailout-guard",
  apply: "build",
  buildEnd() {
    if (compilerBailouts.size === 0) {
      return;
    }
    const listed = [...compilerBailouts].map(([file, summary]) => `  ${file}\n    ${summary}`);
    compilerBailouts.clear();
    throw new Error(
      `React Compiler bailed on ${listed.length} file(s), which therefore ship unoptimized:\n` +
        `${listed.join("\n")}\n\n` +
        "Rewrite the flagged code. Common causes: a conditional, logical operator, " +
        "optional call or loop inside a try/catch; a `finally` clause; a function " +
        "declared after the component's return; a call to a function declared later " +
        "in the same body. If the bailout is genuinely unavoidable, add the file to " +
        "ALLOWED_COMPILER_BAILOUTS in apps/web/vite.config.ts with a reason.",
    );
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
    environments: {
      ssr: {
        resolve: {
          // The web image ships `.output` and no node_modules beside it (see
          // the web stage in the Dockerfile), so an SSR dependency left
          // external only works if Nitro's tracer copied it into
          // .output/server/node_modules. The tracer misses OTel packages that
          // are only reached through a CJS `require`, so the bundle ended up
          // calling `require("@opentelemetry/context-async-hooks")` against a
          // directory without it and every request 500d at module load.
          // Bundling the scope removes the runtime lookup entirely.
          //
          // Build only. These packages are CommonJS, and dev's SSR module
          // runner evaluates an inlined module as ESM, so leaving them
          // noExternal in dev throws "exports is not defined" on the first
          // render. Dev serves from real node_modules, where external works.
          noExternal: command === "build" ? [/^@opentelemetry\//u] : [],
        },
      },
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
      // Router options live in tsr.config.json so this plugin and the `tsr
      // generate` the lint job runs read the same routeFileIgnorePattern.
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
      reactCompilerBailoutGuard,
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
      //
      // Fonts return false (never inline); EVERYTHING ELSE MUST RETURN
      // undefined, not a boolean. A callback that returns true forces the
      // asset inline whatever its size, so `!isFont` inlined every non-font
      // asset ever imported: the 13 MB onnxruntime WASM became an 18 MB
      // base64 string, copied into all five chunks that reference it. That
      // was 98 MB of build output against 25 MB, and the scanner page shipped
      // ~16 MB gzip of base64-in-JS instead of fetching one 3.4 MB gzip wasm
      // the browser can stream-compile and cache. undefined falls back to the
      // 4 KB size rule, which is what everything except fonts wants.
      assetsInlineLimit: (filePath: string) =>
        /\.(?:woff2?|ttf|otf|eot)$/u.test(filePath) ? false : undefined,
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
              // Icons are imported one module per icon, so without this every
              // icon reachable from two routes became its own ~500 byte chunk
              // (126 of them, 65 KB total). The whole set is small enough that
              // one shared chunk costs less than the requests it replaces.
              //
              // Grouping app source the same way does NOT pay off, and was
              // measured: src/lib, src/hooks, src/stores and src/components/ui
              // as groups cut the chunk count further but forced route-specific
              // code into a chunk every route loads, costing 150-250 KB brotli
              // on first load per route. Same for the `?tsr-split=` boundary
              // stubs: 121 tiny files, but merging them drags every route's
              // error-component dependencies everywhere. Re-measure before
              // adding any group below this line.
              {
                test: /node_modules\/lucide-react/u,
                name: "lucide",
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
