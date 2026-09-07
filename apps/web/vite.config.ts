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

const serveMediaPlugin: Plugin = {
  name: "serve-media",
  configureServer(server) {
    server.middlewares.use("/media", (req, res, _next) => {
      const filePath = path.join(mediaDir, req.url?.split("?")[0] ?? "");
      if (!existsSync(filePath)) {
        // Must 404 here, not fall through to next(): that routes the request
        // through the full SSR pipeline for every missing thumbnail.
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

const ALLOWED_COMPILER_BAILOUTS: Record<string, string> = {
  "src/lib/virtualizer-fresh.ts":
    'CompileSkip: carries "use no memo" on purpose (TanStack/virtual#736)',
};

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
      // console.log's default depth=2 would truncate nested detail as "[Object]".
      console.dir(event.detail, { depth: null, colors: true });
    }
    // oxlint-enable no-console
  },
};

// Nothing else in the toolchain fails the build on a compiler bailout; this
// is the only guard. Build only: dev keeps running and just logs.
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

// Disables source-map upload (keeps middleware auto-instrumentation) when
// SENTRY_AUTH_TOKEN is absent, so this is safe in local/dev builds.
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
  // Loaded into process.env (not baked into the bundle) so SSR code can read
  // server-only vars like API_INTERNAL_URL at runtime.
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
          // Build must bundle @opentelemetry/* (Nitro's tracer misses CJS
          // requires, causing 500s); dev's ESM runner throws on it instead.
          noExternal: command === "build" ? [/^@opentelemetry\//u] : [],
        },
      },
    },
    plugins: [
      // Must be first plugin. Skipped under e2e: its SSE console-pipe channel
      // keeps the network busy, breaking Playwright's networkidle wait.
      ...(process.env.VITE_DISABLE_DEVTOOLS ? [] : [devtools()]),
      // getUserMedia (the card scanner's camera) needs a secure context.
      // `bun run dev:http` opts out for e2e, curl checks and self-signed-averse flows.
      ...(process.env.DEV_HTTPS
        ? [
            basicSsl(),
            // Unlocks SharedArrayBuffer for onnxruntime's threaded WASM. COEP
            // blocks any subresource without CORP/CORS; use dev:http if that bites.
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
      // Router options live in tsr.config.json so this plugin and the lint
      // job's `tsr generate` read the same routeFileIgnorePattern.
      tanstackStart(),
      // Build only: in dev, Nitro caches stale SSR HTML after HMR, causing
      // hydration mismatches. https://github.com/TanStack/router/issues/6556
      command === "build" &&
        nitro({
          preset: "bun",
          // Opt-in via `bun run start:lh`; prod is already compressed by Cloudflare/nginx.
          compressPublicAssets: process.env.COMPRESS ? { gzip: true, brotli: true } : false,
        }),
      viteReact(),
      babel({
        presets: [withReactCompilerLogger(reactCompilerPreset())],
      }),
      reactCompilerBailoutGuard,
      ...sentryPlugins,
      // Opt-in via `bun run analyze`, to avoid the post-build cost on every prod build.
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
      // Fonts return false: the production CSP blocks data: URIs for font-src.
      // Everything else must return undefined, not true, or every asset inlines.
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
              // Must come before tanstack-db: query-core is shared by both,
              // and if db's group wins first it pulls tanstack-db into routes that don't use it.
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
              // Unbundled, each icon became its own ~500B chunk. Grouping app
              // source further was measured to cost more than it saves; re-measure before adding groups here.
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
      // Dev only; nginx handles /api/* in production.
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
