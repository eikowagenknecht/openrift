import type { SitemapDataResponse } from "@openrift/shared";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3000";
const SITE_URL = "https://openrift.app";

const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/cards", priority: "0.8", changefreq: "daily" },
  { path: "/sets", priority: "0.7", changefreq: "weekly" },
  { path: "/rules", priority: "0.5", changefreq: "monthly" },
  { path: "/help", priority: "0.4", changefreq: "monthly" },
  { path: "/roadmap", priority: "0.3", changefreq: "monthly" },
  { path: "/changelog", priority: "0.3", changefreq: "monthly" },
];

async function generateSitemap(): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/sitemap-data`);
  if (!res.ok) {
    throw new Error(`Sitemap data fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as SitemapDataResponse;

  const urls: string[] = [];
  for (const page of STATIC_PAGES) {
    urls.push(
      `  <url><loc>${SITE_URL}${page.path}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`,
    );
  }
  for (const slug of data.cardSlugs) {
    urls.push(
      `  <url><loc>${SITE_URL}/cards/${slug}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
    );
  }
  for (const slug of data.setSlugs) {
    urls.push(
      `  <url><loc>${SITE_URL}/sets/${slug}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
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
