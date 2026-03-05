// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import { execSync } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules -- Vite config runs in Node.js
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();
const proxy = { "/api": "http://localhost:3000" };

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [
    TanStackRouterVite(),
    tailwindcss(),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    VitePWA({
      registerType: "prompt",
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
        globPatterns: ["**/*.{js,css,html,png,webp,svg,woff,woff2}"],
        navigateFallbackDenylist: [/\.txt$/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cmsassets\.rgpub\.io\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "card-images",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
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
            id.includes("next-themes") ||
            id.includes("class-variance-authority") ||
            id.includes("/clsx/")
          ) {
            return "ui";
          }
        },
      },
    },
  },
  server: { proxy },
  preview: { proxy },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
