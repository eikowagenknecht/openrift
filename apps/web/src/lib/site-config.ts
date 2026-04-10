/**
 * Runtime site configuration. Resolved per request on the server (from
 * `process.env`) and per navigation on the client (from `window.location`).
 *
 * Kept in its own module — NOT in the router context — because wiring
 * `siteUrl` through `match.context` in route `head()` functions triggers a
 * TanStack Router type-inference cycle on routes that also have a
 * `throw redirect(...)` beforeLoad. Reading directly sidesteps the cycle
 * and keeps head() type-simple.
 */

/**
 * Resolves the public origin for this deployment. On the server reads
 * `process.env.SITE_URL`; on the client returns `window.location.origin`.
 * The localhost dev fallback is deliberate — a missing env in production
 * must fail loudly rather than silently leak `https://openrift.app` into
 * preview deploys.
 *
 * @returns Absolute origin URL, no trailing slash (e.g. `https://openrift.app`).
 */
export function getSiteUrl(): string {
  if (globalThis.window === undefined) {
    return process.env.SITE_URL ?? "http://localhost:5173";
  }
  return globalThis.window.location.origin;
}

/**
 * Whether this request/navigation is running on a preview deployment. On
 * the server reads `process.env.APP_ENV`; on the client reads the noindex
 * meta tag that SSR injects on preview (see __root.tsx).
 *
 * @returns `true` when the current deployment should be excluded from
 * search indexing.
 */
export function getIsPreview(): boolean {
  if (globalThis.window === undefined) {
    return process.env.APP_ENV === "preview";
  }
  return (
    globalThis.document
      .querySelector<HTMLMetaElement>('meta[name="robots"]')
      ?.content.includes("noindex") ?? false
  );
}
