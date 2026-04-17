import type { SitemapDataResponse } from "@openrift/shared";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { applyPageCacheControl } from "./lib/page-cache";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3000";

// Opt-in SSR timing instrumentation. Mirrors the API's LOG_REQUESTS flag:
// default off, no overhead in prod unless explicitly enabled for benchmarking.
const LOG_SSR_TIMINGS = process.env.LOG_SSR_TIMINGS === "true";

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
    const t0 = LOG_SSR_TIMINGS ? performance.now() : 0;
    const response = await handler.fetch(request);
    const tHandler = LOG_SSR_TIMINGS ? performance.now() : 0;
    const finalResponse = applyPageCacheControl(request, response);
    if (LOG_SSR_TIMINGS) {
      const tEnd = performance.now();
      // oxlint-disable-next-line no-console -- opt-in SSR timing instrumentation, see LOG_SSR_TIMINGS flag above.
      console.info(
        `[SSR] ${request.method} ${url.pathname} total=${(tEnd - t0).toFixed(0)}ms handler=${(tHandler - t0).toFixed(0)}ms postprocess=${(tEnd - tHandler).toFixed(0)}ms`,
      );
    }
    return finalResponse;
  },
});
