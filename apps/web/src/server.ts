// Must be the first imports: initialize Sentry + OTel before any request handling.
// oxlint-disable-next-line import/no-unassigned-import -- side-effect instrumentation bootstrap
import "./instrument.server.mjs";
// oxlint-disable-next-line import/no-unassigned-import -- side-effect instrumentation bootstrap
import "./tracing.server";
import type { FeatureFlagsResponse, SetListResponse, SitemapDataResponse } from "@openrift/shared";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { deriveSetEras } from "./lib/meta-scope";
import { applyPageCacheControl } from "./lib/page-cache";
import { fetchApiJson } from "./lib/server-fns/fetch-api";
import type { SitemapInput } from "./lib/sitemap";
import {
  parseSitemapPath,
  renderSitemapFile,
  renderSitemapIndex,
  SITEMAP_INDEX_PATH,
} from "./lib/sitemap";

const LOG_SSR_TIMINGS = process.env.LOG_SSR_TIMINGS === "true";

const DEPLOY_DATE = new Date().toISOString().slice(0, 10);

function getSiteUrl(): string {
  // Must stay in sync with runtime-config.ts.
  return process.env.SITE_URL ?? "http://localhost:5173";
}

function isPreview(): boolean {
  return process.env.APP_ENV === "preview";
}

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
    `Sitemap: ${getSiteUrl()}${SITEMAP_INDEX_PATH}`,
    "",
  ].join("\n");
}

// A failed fetch degrades to all flags off; the sitemap still builds.
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

async function sitemapInput(): Promise<SitemapInput> {
  const [data, flags, sets] = await Promise.all([
    fetchApiJson<SitemapDataResponse>({
      errorTitle: "Couldn't load sitemap data",
      path: "/api/v1/sitemap-data",
    }),
    fetchGlobalFeatureFlags(),
    fetchApiJson<SetListResponse>({ errorTitle: "Couldn't load sets", path: "/api/v1/sets" }),
  ]);
  return {
    siteUrl: getSiteUrl(),
    deployDate: DEPLOY_DATE,
    data,
    flags,
    eras: deriveSetEras(sets.sets),
  };
}

function xmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
    },
  });
}

// The archive alone holds more URLs than one sitemap may, so `/sitemap.xml` is
// an index and each section its own file, split further past the per-file limit.
async function sitemapResponse(pathname: string): Promise<Response | null> {
  if (pathname === SITEMAP_INDEX_PATH) {
    return xmlResponse(renderSitemapIndex(await sitemapInput()));
  }
  const file = parseSitemapPath(pathname);
  if (file === null) {
    return null;
  }
  const xml = renderSitemapFile(file.section, file.index, await sitemapInput());
  return xml === null ? new Response("Not found", { status: 404 }) : xmlResponse(xml);
}

// Not wrapped in wrapFetchWithSentry: it injects <meta> tags into <head> outside
// React's render tree, which our hydrateRoot(document) throws #418 on (prod-only).
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
    if (url.pathname === SITEMAP_INDEX_PATH || url.pathname.startsWith("/sitemap-")) {
      try {
        const sitemap = await sitemapResponse(url.pathname);
        if (sitemap !== null) {
          return sitemap;
        }
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
