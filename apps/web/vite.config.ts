// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import { execSync } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import { createReadStream, existsSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();
const cardImagesDir = path.resolve(__dirname, "../../card-images");

export default defineConfig({
  devtools: false,
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [
    // Serve /card-images/ from repo root in dev (in prod, volume mount handles this)
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
    tanstackStart(),
    tailwindcss(),
    react(),
    nitro({
      preset: process.env.NITRO_PRESET ?? "bun",
      scanDirs: ["server"],
      routeRules: {
        "/api/**": {
          proxy: `${process.env.API_URL ?? "http://localhost:3000"}/**`,
        },
        "/card-images/**": {
          headers: { "cache-control": "public, max-age=31536000, immutable" },
        },
        "/assets/**": {
          headers: { "cache-control": "public, max-age=31536000, immutable" },
        },
        "/sw.js": { headers: { "cache-control": "no-cache" } },
      },
    }),
    VitePWA({
      outDir: ".output/public",
      registerType: "autoUpdate",
      includeAssets: [
        "logo.webp",
        "favicon-64x64.png",
        "apple-touch-icon-180x180.png",
        "icons/**/*",
      ],
      manifest: {
        id: "/",
        name: "OpenRift — A Riftbound Companion",
        short_name: "OpenRift",
        description: "Fast. Open. Ad-free. A Riftbound companion.",
        theme_color: "#1d1538",
        background_color: "#0a0a0a",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,png,webp,svg,woff,woff2}"],
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/card-images\//,
          /^\/riot\.txt$/,
          /^\/robots\.txt$/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-pages",
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\.(?:png|jpe?g|webp|avif|svg)(?:\?.*)?$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "card-images",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
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
  server: { forwardConsole: true },
  resolve: {
    tsconfigPaths: true,
  },
});
