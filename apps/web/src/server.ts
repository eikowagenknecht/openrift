// Must be the first imports: initialize Sentry + OTel before any request
// handling. See ./instrument.server.mjs for the "without --import flag"
// rationale; tracing.server.ts is the OTel equivalent for trace export to
// Tempo (no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset).
// oxlint-disable-next-line import/no-unassigned-import -- side-effect instrumentation bootstrap
import "./instrument.server.mjs";
// oxlint-disable-next-line import/no-unassigned-import -- side-effect instrumentation bootstrap
import "./tracing.server";
import type { FeatureFlagsResponse, SitemapDataResponse } from "@openrift/shared";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { helpArticleList } from "./components/help/articles";
import { applyPageCacheControl } from "./lib/page-cache";
import { VALID_RULE_KINDS } from "./lib/rules-kinds";
import { fetchApiJson } from "./lib/server-fns/fetch-api";

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
    "# Share pages are unlisted via a noindex meta tag on the page itself.",
    "# Crawling must stay allowed so engines can see that tag — a robots block",
    "# alone would leave externally-linked share URLs indexable.",
    "Allow: /collections/share/",
    "Allow: /decks/share/",
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

interface StaticPage {
  path: string;
  priority: string;
  changefreq: string;
  // Only listed while this feature flag is enabled — the route redirects away
  // when the flag is off, and crawlers shouldn't see URLs that depend on flag
  // state (same rationale as the help articles below).
  featureFlag?: string;
}

const STATIC_PAGES: StaticPage[] = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/cards", priority: "0.8", changefreq: "weekly" },
  { path: "/sets", priority: "0.7", changefreq: "weekly" },
  { path: "/products", priority: "0.7", changefreq: "weekly" },
  // /promos always 302s to the EN page, so list the redirect target — sitemaps
  // should carry the final canonical URL (same rationale as the rules kinds).
  { path: "/promos/EN", priority: "0.6", changefreq: "weekly" },
  { path: "/meta", priority: "0.6", changefreq: "weekly", featureFlag: "meta" },
  { path: "/meta/events", priority: "0.6", changefreq: "weekly", featureFlag: "meta" },
  { path: "/meta/decks", priority: "0.5", changefreq: "weekly", featureFlag: "meta" },
  { path: "/meta/legends", priority: "0.5", changefreq: "weekly", featureFlag: "meta" },
  { path: "/rules", priority: "0.5", changefreq: "monthly" },
  { path: "/help", priority: "0.4", changefreq: "monthly" },
  { path: "/roadmap", priority: "0.3", changefreq: "monthly" },
  { path: "/changelog", priority: "0.3", changefreq: "weekly" },
  { path: "/developers", priority: "0.3", changefreq: "monthly", featureFlag: "developers" },
  { path: "/legal-notice", priority: "0.1", changefreq: "yearly" },
  { path: "/privacy-policy", priority: "0.1", changefreq: "yearly" },
];

// Global flag defaults for sitemap gating (anonymous view, no per-user
// overrides). A failed fetch degrades to "all flags off": flag-gated entries
// drop out of the sitemap rather than failing the whole sitemap.
async function fetchGlobalFeatureFlags(): Promise<Record<string, boolean>> {
  try {
    const data = await fetchApiJson<FeatureFlagsResponse>({
      errorTitle: "Couldn't load feature flags",
      path: "/api/v1/feature-flags",
    });
    return data.flags;
  } catch {
    return {};
  }
}

async function generateSitemap(): Promise<string> {
  const siteUrl = getSiteUrl();
  const [data, flags] = await Promise.all([
    fetchApiJson<SitemapDataResponse>({
      errorTitle: "Couldn't load sitemap data",
      path: "/api/v1/sitemap-data",
    }),
    fetchGlobalFeatureFlags(),
  ]);

  const urls: string[] = [];
  for (const page of STATIC_PAGES) {
    if (page.featureFlag !== undefined && flags[page.featureFlag] !== true) {
      continue;
    }
    urls.push(
      `  <url><loc>${siteUrl}${page.path}</loc><lastmod>${DEPLOY_DATE}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`,
    );
  }
  // Help articles are static content shipped with the bundle, so the deploy
  // date is the closest "lastmod" we have. Skip feature-flagged articles —
  // crawlers shouldn't see URLs that may 404 depending on flag state.
  for (const article of helpArticleList) {
    if (article.featureFlag) {
      continue;
    }
    urls.push(
      `  <url><loc>${siteUrl}/help/${article.slug}</loc><lastmod>${DEPLOY_DATE}</lastmod><changefreq>monthly</changefreq><priority>0.3</priority></url>`,
    );
  }
  // Per-kind rules pages (core, tournament). Each 302s to its latest version,
  // but the kind URL is the stable, version-independent entry worth indexing.
  for (const kind of VALID_RULE_KINDS) {
    urls.push(
      `  <url><loc>${siteUrl}/rules/${kind}</loc><lastmod>${DEPLOY_DATE}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
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
  for (const entry of data.products) {
    const lastmod = entry.updatedAt.slice(0, 10);
    urls.push(
      `  <url><loc>${siteUrl}/products/${entry.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
    );
  }
  // The meta archive ships behind its flag (ADR-014), so its URLs stay out of
  // the sitemap until it is on — same reason flagged static pages and help
  // articles are skipped above.
  if (flags.meta === true) {
    for (const entry of data.metaEvents) {
      const lastmod = entry.updatedAt.slice(0, 10);
      urls.push(
        `  <url><loc>${siteUrl}/meta/${entry.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
      );
    }
    for (const entry of data.metaDecks) {
      const lastmod = entry.updatedAt.slice(0, 10);
      urls.push(
        `  <url><loc>${siteUrl}/meta/decks/${entry.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
      );
    }
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");
}

// Intentionally NOT wrapped in wrapFetchWithSentry. That wrapper string-injects
// <meta name="sentry-trace"> / <meta name="baggage"> into <head> on every HTML
// response, outside React's render tree. With our full-document
// hydrateRoot(document) (which hydrates <head>), React finds head children it
// never rendered and throws an unrecoverable hydration error (#418) on every
// page — prod-only, because the tags appear only when SENTRY_DSN_SSR is set.
// Sentry error capture and server/function spans come from the global
// middlewares in start.ts; Grafana/Tempo spans from otelRequestMiddleware +
// tracing.server.ts. Dropping the wrapper therefore loses only Sentry's
// server→client trace-meta linkage, not error tracking. See lib/sentry-client.ts.
export default createServerEntry({
  async fetch(request: Request) {
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
