/**
 * The server-internal API base URL.
 *
 * This is ONLY valid on the server (SSR + server-function handlers), where
 * `API_INTERNAL_URL` points at the API container. In the browser bundle the env
 * var is absent, so it degrades to the `http://localhost:3000` dev fallback — a
 * cross-origin URL the production CSP blocks. Browser-direct calls must go
 * same-origin through `browserApiOrpcClient`, never the internal base.
 *
 * To stop that mistake from silently degrading (it hits localhost:3000, which
 * "works" in dev but is CSP-blocked on preview/prod), reading this value in a
 * browser throws whenever the resolved base is not same-origin. Under jsdom the
 * page origin equals the localhost fallback, so server-function unit tests are
 * unaffected; in a real browser the origins differ and the call fails loudly in
 * dev/CI instead of only on preview. It is exposed as a getter (not a const) so
 * the guard runs at use time — importing this module in the browser bundle is
 * always safe.
 * @returns The server-internal API base URL.
 */
export function getApiUrl(): string {
  const url = process.env.API_INTERNAL_URL ?? "http://localhost:3000";
  if (globalThis.window !== undefined && url !== globalThis.location.origin) {
    throw new Error(
      `getApiUrl() returned the server-internal API base "${url}" in the browser ` +
        `(page origin is "${globalThis.location.origin}"). Browser code must call ` +
        `the API same-origin via browserApiOrpcClient, never the internal base.`,
    );
  }
  return url;
}
