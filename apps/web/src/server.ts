// oxlint-disable-next-line import/no-nodejs-modules -- server entry runs in Bun/Node.js
import { readFile } from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- server entry runs in Bun/Node.js
import path from "node:path";

import type { SitemapDataResponse } from "@openrift/shared";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3000";

// Local-only helper for `bun run start` smoke tests: when MEDIA_DIR is set,
// serve /media/* from that host directory. In real prod, this env var is unset
// so serveMediaFile() short-circuits to undefined, AND nginx bind-mounts the
// path in front of the server — so this code is inert there.
const MEDIA_DIR = process.env.MEDIA_DIR ? path.resolve(process.env.MEDIA_DIR) : undefined;

const MEDIA_MIME: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

async function serveMediaFile(pathname: string): Promise<Response | undefined> {
  if (!MEDIA_DIR) {
    return undefined;
  }
  const relative = decodeURIComponent(pathname.slice("/media/".length));
  const resolved = path.resolve(MEDIA_DIR, relative);
  if (!resolved.startsWith(`${MEDIA_DIR}${path.sep}`)) {
    return new Response("Forbidden", { status: 403 });
  }
  let buffer: Buffer;
  try {
    buffer = await readFile(resolved);
  } catch {
    return new Response("Not Found", { status: 404 });
  }
  const bytes = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(bytes).set(buffer);
  const mime = MEDIA_MIME[path.extname(resolved).toLowerCase()] ?? "application/octet-stream";
  return new Response(new Blob([bytes], { type: mime }), {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}

const DEPLOY_DATE = new Date().toISOString().slice(0, 10);

function getSiteUrl(): string {
  // Dev fallback is a localhost URL on purpose — a missing SITE_URL in
  // production should fail loudly rather than silently leaking the prod URL
  // into preview deploys. Must stay in sync with runtime-config.ts.
  return process.env.SITE_URL ?? "http://localhost:5173";
}

function isPreview(): boolean {
  return process.env.APP_ENV === "preview";
}

// Preview deploys serve a restrictive robots.txt to block crawlers.
// Layer 2 of 3 (see __root.tsx meta + nginx X-Robots-Tag).
const PREVIEW_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

function buildProdRobotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    "# Authenticated-only routes (not useful to crawlers)",
    "Disallow: /collections",
    "Disallow: /decks",
    "Disallow: /profile",
    "Disallow: /admin",
    "",
    "# Auth flows",
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /reset-password",
    "Disallow: /verify-email",
    "",
    `Sitemap: ${getSiteUrl()}/sitemap.xml`,
    "",
  ].join("\n");
}

const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/cards", priority: "0.8", changefreq: "weekly" },
  { path: "/sets", priority: "0.7", changefreq: "weekly" },
  { path: "/rules", priority: "0.5", changefreq: "monthly" },
  { path: "/help", priority: "0.4", changefreq: "monthly" },
  { path: "/roadmap", priority: "0.3", changefreq: "monthly" },
  { path: "/changelog", priority: "0.3", changefreq: "weekly" },
];

async function generateSitemap(): Promise<string> {
  const siteUrl = getSiteUrl();
  const res = await fetch(`${API_URL}/api/v1/sitemap-data`);
  if (!res.ok) {
    throw new Error(`Sitemap data fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as SitemapDataResponse;

  const urls: string[] = [];
  for (const page of STATIC_PAGES) {
    urls.push(
      `  <url><loc>${siteUrl}${page.path}</loc><lastmod>${DEPLOY_DATE}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`,
    );
  }
  for (const entry of data.cards) {
    const lastmod = entry.updatedAt.slice(0, 10);
    urls.push(
      `  <url><loc>${siteUrl}/cards/${entry.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`,
    );
  }
  for (const entry of data.sets) {
    const lastmod = entry.updatedAt.slice(0, 10);
    urls.push(
      `  <url><loc>${siteUrl}/sets/${entry.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");
}

export default createServerEntry({
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }
    if (MEDIA_DIR && url.pathname.startsWith("/media/")) {
      const response = await serveMediaFile(url.pathname);
      if (response) {
        return response;
      }
    }
    if (url.pathname === "/robots.txt") {
      return new Response(isPreview() ? PREVIEW_ROBOTS_TXT : buildProdRobotsTxt(), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
    if (url.pathname === "/sitemap.xml") {
      try {
        const xml = await generateSitemap();
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
          },
        });
      } catch {
        return new Response("Sitemap generation failed", { status: 500 });
      }
    }
    return handler.fetch(request);
  },
});
