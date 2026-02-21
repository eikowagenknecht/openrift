import { execSync } from "node:child_process";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [
    tailwindcss(),
    react(),
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
        name: "OpenRift — Riftbound Card Browser",
        short_name: "OpenRift",
        description: "Fast, open, ad-free card browser for the Riftbound trading card game",
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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
