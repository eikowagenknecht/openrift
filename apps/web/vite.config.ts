// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import { execSync } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import { createReadStream, existsSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import path from "node:path";

import babel from "@rolldown/plugin-babel";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
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

// Sentry source map upload — only active when SENTRY_AUTH_TOKEN is set (CI builds).
const sentryPlugin = sentryVitePlugin({
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: { name: commitHash },
  sourcemaps: { filesToDeleteAfterUpload: ["./.output/**/*.map"] },
  disable: !process.env.SENTRY_AUTH_TOKEN,
});

// React + TanStack are tightly coupled — keep together to avoid circular chunks.
const REACT_CHUNK_NEEDLES = [
  "/node_modules/react/",
  "/node_modules/react-dom/",
  "/node_modules/scheduler/",
  "@tanstack/",
];

// Stable UI/vendor deps — large but rarely change.
// Don't use a catch-all here; transitive deps (e.g. use-sync-external-store)
// must stay with their consumers to avoid circular initialization.
const UI_CHUNK_NEEDLES = [
  "@base-ui/",
  "@floating-ui/",
  "tailwind-merge",
  "better-auth",
  "react-hook-form",
  "@hookform/",
  "/zod/",
  "/sonner/",
  "lucide-react",
  "class-variance-authority",
  "/clsx/",
];

function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) {
    return;
  }
  if (REACT_CHUNK_NEEDLES.some((needle) => id.includes(needle))) {
    return "react";
  }
  if (UI_CHUNK_NEEDLES.some((needle) => id.includes(needle))) {
    return "ui";
  }
}

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
      command === "build" && nitro({ preset: "bun" }),
      viteReact(),
      babel({
        presets: [withReactCompilerLogger(reactCompilerPreset())],
      }),
      sentryPlugin,
    ],
    build: {
      sourcemap: true,
      rolldownOptions: {
        output: { manualChunks },
      },
    },
    server: {
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
