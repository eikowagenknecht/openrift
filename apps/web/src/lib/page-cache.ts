import hankenGroteskLatinWoff2 from "@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2?url";

import indexCss from "@/index.css?url";

const PUBLIC_PAGE_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";
const PRIVATE_PAGE_CACHE_CONTROL = "private, no-cache";

// Bare `crossorigin` (no `=anonymous`) is the canonical RFC 8288 form for
// fonts; a quoted attribute value trips stricter parsers.
const PRELOAD_LINKS = [
  `<${indexCss}>; rel=preload; as=style`,
  `<${hankenGroteskLatinWoff2}>; rel=preload; as=font; type="font/woff2"; crossorigin`,
];

// Keep in sync with deploy.sh.example's purge_cloudflare_cache() prefix list.
const EXACT_PATHS = new Set([
  "/",
  "/cards",
  "/sets",
  "/rules",
  "/privacy-policy",
  "/promos",
  "/products",
]);
const PREFIX_PATHS = ["/cards/", "/sets/", "/rules/", "/decks/share/", "/promos/", "/products/"];

function isCacheablePublicPath(pathname: string): boolean {
  if (EXACT_PATHS.has(pathname)) {
    return true;
  }
  return PREFIX_PATHS.some((prefix) => pathname.startsWith(prefix));
}

function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie");
  if (!cookie) {
    return false;
  }
  return /better-auth\.session_token/u.test(cookie);
}

function isAnonymousCacheable(request: Request, response: Response, pathname: string): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }
  if (response.status !== 200) {
    return false;
  }
  if (response.headers.has("set-cookie")) {
    return false;
  }
  if (!isCacheablePublicPath(pathname)) {
    return false;
  }
  return !hasSessionCookie(request);
}

/**
 * Must stay the only place that sets `Cache-Control` on SSR responses: nginx
 * setting it too merges into one header and sticks Cloudflare's edge cache in `UPDATING`.
 */
export function applyPageCacheControl(request: Request, response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const url = new URL(request.url);
  const cacheControl = isAnonymousCacheable(request, response, url.pathname)
    ? PUBLIC_PAGE_CACHE_CONTROL
    : PRIVATE_PAGE_CACHE_CONTROL;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", cacheControl);
  if (response.status === 200) {
    for (const link of PRELOAD_LINKS) {
      headers.append("Link", link);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
