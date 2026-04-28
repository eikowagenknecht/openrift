import interLatinWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";

import indexCss from "@/index.css?url";

// Public SSR pages emit near-static HTML shells; dynamic data is fetched
// client-side and edge-cached separately on its own /api/v1/* paths. Long swr
// keeps the edge serving fast cached HTML during low-traffic periods (e.g.
// cold Lighthouse runs) while a background revalidation picks up any deploy
// changes; a request only hits origin when the swr window has fully elapsed.
const PUBLIC_PAGE_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";
const PRIVATE_PAGE_CACHE_CONTROL = "private, no-cache";

// Cloudflare's Early Hints feature caches `Link: <...>; rel=preload` headers
// from origin 200 responses and replays them as `103 Early Hints` on the next
// visit, before this server even runs. Same hints work for every HTML route
// (one CSS bundle, one Latin Inter face), so emitted statically here.
// Bare `crossorigin` token (no `=anonymous`) is the canonical RFC 8288 form
// for fonts; quoted attribute values would trip stricter parsers.
const PRELOAD_LINKS = [
  `<${indexCss}>; rel=preload; as=style`,
  `<${interLatinWoff2}>; rel=preload; as=font; type="font/woff2"; crossorigin`,
];

const EXACT_PATHS = new Set(["/", "/cards", "/sets", "/rules", "/privacy-policy", "/promos"]);
const PREFIX_PATHS = ["/cards/", "/sets/", "/decks/share/"];

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
  // Matches better-auth default (`better-auth.session_token`) and the
  // `__Secure-` prefixed variant set on HTTPS origins.
  return /better-auth\.session_token/.test(cookie);
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
 * Sets `Cache-Control` on HTML responses so the app is the single source of
 * truth for cacheability. Anonymous GETs on the public allowlist become edge-
 * cacheable; everything else is forced to `private, no-cache`. Non-HTML
 * responses pass through untouched.
 *
 * This must be the only place in the stack that sets `Cache-Control` on SSR
 * responses: the nginx catch-all proxy previously added `no-cache`
 * unconditionally, which combined with the app's `public, max-age=60` into a
 * single merged header and kept Cloudflare's edge cache permanently in the
 * `UPDATING` state.
 *
 * @returns A response with `Cache-Control` rewritten when the response is HTML, otherwise the original response.
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
