// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import { execSync } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import { createReadStream, existsSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import path from "node:path";

import babel from "@rolldown/plugin-babel";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();
const cardImagesDir = path.resolve(__dirname, "../../card-images");

const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig(({ mode, command }) => {
  // Load .env from the monorepo root into process.env so SSR code can access
  // server-only vars like API_INTERNAL_URL at runtime (not baked into the bundle).
  const env = loadEnv(mode, repoRoot, "");
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  return {
    devtools: false,
    define: {
      __COMMIT_HASH__: JSON.stringify(commitHash),
    },
    plugins: [
      // Serve /card-images/ from repo root in dev (in prod, nginx bind mount handles this)
      {
        name: "serve-card-images",
        configureServer(server) {
          server.middlewares.use("/card-images", (req, res, next) => {
            const filePath = path.join(cardImagesDir, req.url?.split("?")[0] ?? "");
            if (!existsSync(filePath)) {
              return next();
            }
            const ext = path.extname(filePath).toLowerCase();
            const mime =
              ext === ".webp"
                ? "image/webp"
                : ext === ".png"
                  ? "image/png"
                  : "application/octet-stream";
            res.setHeader("Content-Type", mime);
            createReadStream(filePath).pipe(res);
          });
        },
      },
      tanstackStart({ srcDirectory: "src" }),
      // Only enable Nitro for production builds — in dev it caches stale SSR
      // HTML after HMR updates, causing hydration mismatches.
      // See https://github.com/TanStack/router/issues/6556
      command === "build" &&
        nitro({
          preset: "bun",
          publicAssets: [
            {
              baseURL: "card-images",
              dir: "../../card-images",
              maxAge: 3600,
            },
          ],
        }),
      tailwindcss(),
      react(),
      babel({
        presets: [reactCompilerPreset()],
        exclude: /node_modules|packages\//,
      }),
      // Sentry source map upload — only active when SENTRY_AUTH_TOKEN is set (CI builds).
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: { name: commitHash },
        sourcemaps: { filesToDeleteAfterUpload: ["./.output/**/*.map"] },
        disable: !process.env.SENTRY_AUTH_TOKEN,
      }),
      // VitePWA disabled — the self-destroying SW was only needed to clean up
      // the old PWA. TanStack Start outputs to .output/ which VitePWA doesn't
      // support. Re-enable if PWA is needed again.
      // VitePWA({ selfDestroying: true, ... }),
    ],
    build: {
      sourcemap: true,
      rolldownOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return;
            }
            // React + TanStack are tightly coupled — keep together to avoid circular chunks.
            if (
              /\/node_modules\/react-dom\//.test(id) ||
              /\/node_modules\/react\//.test(id) ||
              /\/node_modules\/scheduler\//.test(id) ||
              id.includes("@tanstack/")
            ) {
              return "react";
            }
            // Stable UI/vendor deps — large but rarely change.
            // Don't use a catch-all here; transitive deps (e.g. use-sync-external-store)
            // must stay with their consumers to avoid circular initialization.
            if (
              id.includes("@base-ui/") ||
              id.includes("@floating-ui/") ||
              id.includes("tailwind-merge") ||
              id.includes("better-auth") ||
              id.includes("react-hook-form") ||
              id.includes("@hookform/") ||
              id.includes("/zod/") ||
              id.includes("/nuqs/") ||
              id.includes("/sonner/") ||
              id.includes("lucide-react") ||
              id.includes("class-variance-authority") ||
              id.includes("/clsx/")
            ) {
              return "ui";
            }
          },
        },
      },
    },
    server: {
      port: 5173,
      forwardConsole: true,
    },
    resolve: {
      tsconfigPaths: true,
    },
  };
});
