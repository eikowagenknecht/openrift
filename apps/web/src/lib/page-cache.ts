const PUBLIC_PAGE_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

const EXACT_PATHS = new Set(["/", "/cards", "/sets", "/rules", "/privacy-policy", "/promos"]);
const PREFIX_PATHS = ["/cards/", "/sets/"];

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

/**
 * Rewrites `Cache-Control` on anonymous responses for a narrow allowlist of
 * public pages so Cloudflare can cache them at the edge. The SSR layer
 * otherwise emits `no-cache`, which defeats edge caching entirely.
 *
 * We only cache when it is safe to: GET, 200 OK, HTML, no incoming session
 * cookie, no outgoing `Set-Cookie`. Logged-in users continue to receive
 * `no-cache` so their personalized nav is not served from a stale cache.
 *
 * @returns A response with rewritten headers when cacheable, otherwise the original response unchanged.
 */
export function maybeApplyPublicCache(request: Request, response: Response): Response {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return response;
  }
  if (response.status !== 200) {
    return response;
  }
  if (response.headers.has("set-cookie")) {
    return response;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }
  const url = new URL(request.url);
  if (!isCacheablePublicPath(url.pathname)) {
    return response;
  }
  if (hasSessionCookie(request)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", PUBLIC_PAGE_CACHE_CONTROL);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
