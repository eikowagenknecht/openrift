// Where Electric shape requests go, and how they authenticate (ADR-027).
//
// In production shapes are same-origin: nginx routes /api/* to the API
// container, and Cloudflare / HTTP-2 multiplex the standing live long-polls,
// so they never compete with the app's own requests for browser connections.
//
// The vite dev server is different: `server.proxy` forces it onto HTTP/1.1,
// where browsers cap connections at ~6 per origin. Per-user shapes hold live
// long-polls open ~20s each, permanently occupying most of that pool — every
// oRPC call, image, and HMR request then queues behind them for up to 20s
// (the failure that got ADR-027 pulled from main). The fix is a separate
// connection pool: in dev, shapes bypass the proxy and hit the API origin
// directly (`__ELECTRIC_SHAPE_ORIGIN__` is the vite proxy target, inlined by
// vite.config.ts; production builds inline "").

/**
 * Base origin for Electric shape URLs: the API origin in dev, the page's own
 * origin in production.
 *
 * @returns The origin to prefix shape paths with.
 */
export function electricShapeOrigin(): string {
  return __ELECTRIC_SHAPE_ORIGIN__ || globalThis.location.origin;
}

/**
 * Fetch client for authenticated (per-user) shapes. Cookies are same-origin
 * by default, so the dev cross-origin path would silently 401 without
 * `credentials: "include"`; localhost ports are same-site, so the session
 * cookie is allowed. Same-origin requests are unaffected.
 *
 * @returns The fetch response promise.
 */
export function electricAuthenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" });
}
