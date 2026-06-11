import type { ApiErrorResponse } from "@openrift/shared";
import { context, propagation } from "@opentelemetry/api";
import type { AppType } from "api/rpc";
import type { ClientResponse } from "hono/client";
import { hc } from "hono/client";

import { apiErrorFromResponse } from "./api-error";
import { API_URL } from "./api-url";
import { activeClientIp } from "./client-ip-context";

/**
 * Typed Hono RPC client for the API, bound to one SSR request's cookie.
 *
 * Created fresh per server-fn call — the returned object is a cheap Proxy; what
 * is expensive is the `AppType` graph, and that is instantiated exactly once
 * (here), shared by every caller. Never call `hc<AppType>(...)` per hook.
 *
 * `headers` is the function form on purpose: it runs PER request (not at client
 * construction), so `propagation.inject` captures the OTel span active at call
 * time — matching {@link import("./fetch-api").fetchApi}. The cookie is
 * per-request and must be closed over here because the server has no ambient
 * cookie to read (unlike the browser, which sends it automatically); the
 * `withCookies` middleware lifts it off the SSR request into `context.cookie`.
 * @returns A typed `hc<AppType>` client for one request.
 */
export function serverApiClient(cookie?: string) {
  return hc<AppType>(API_URL, {
    headers: () => {
      const headers: Record<string, string> = {};
      if (cookie !== undefined) {
        headers.cookie = cookie;
      }
      // Inject W3C traceparent so the API can continue the trace started by the
      // web server-side middleware. No-op when no span is active.
      propagation.inject(context.active(), headers);
      // Forward the real visitor IP (lifted onto the request context by
      // middleware/otel-request.ts) so the API's logs and rate limiters see
      // the user, not the web container. Absent outside a request scope.
      const clientIp = activeClientIp();
      if (clientIp !== undefined) {
        headers["x-real-ip"] = clientIp;
      }
      return headers;
    },
  });
}

let browserClient: ReturnType<typeof hc<AppType>> | null = null;

/**
 * Typed Hono RPC client for calling the API DIRECTLY from the browser — not from
 * a `createServerFn` handler. Used by the client-side query/mutation functions
 * that deliberately bypass the server-fn round-trip (public reads that should hit
 * the Cloudflare edge cache directly; cancelable mutations that need a live
 * `AbortController`).
 *
 * Differs from {@link serverApiClient}: no `headers` function — the browser sends
 * the same-origin session cookie automatically, and there is no server span to
 * propagate. The base is `window.location.origin` (absolute, same-origin) so the
 * request URL is byte-identical to the old hand-written relative
 * `fetch("/api/v1/...")` and lands on the same edge-cached origin; hc does NOT
 * support a relative/empty base (its `$url()` throws on one).
 *
 * Memoized because the `AppType` graph is expensive to instantiate.
 * `globalThis.location` is read lazily, so importing this module on the server is
 * safe — but CALLING it during SSR would throw. Only invoke it from a
 * browser-only code path (e.g. the `globalThis.window === undefined ? serverFn()
 * : fromEdge()` switch).
 * @returns A typed `hc<AppType>` client bound to the current page origin.
 */
export function browserApiClient() {
  return (browserClient ??= hc<AppType>(globalThis.location.origin));
}

/**
 * Percent-encodes path-param values for a Hono RPC call. hc interpolates `param`
 * values into the URL RAW (its `replaceUrlParam` does NOT `encodeURIComponent`,
 * unlike query params) — so a value containing a space, slash, `?` or `#` would
 * break the route match or inject a fake query/fragment. The old hand-built
 * `fetchApi` paths wrapped every path param in `encodeURIComponent`, so always
 * wrap free-text path params to preserve that: `param: encodeParams({ name })`.
 * Already-safe values (UUIDs, slugs) pass through unchanged, so wrapping is
 * always safe and never double-encodes.
 * @returns The same keys with each value `encodeURIComponent`-encoded.
 */
export function encodeParams<Params extends Record<string, string>>(params: Params): Params {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, encodeURIComponent(value)]),
  ) as Params;
}

/**
 * Awaits a Hono RPC call and enforces the API error contract. On a non-ok
 * status that isn't listed in `acceptStatuses`, it parses the standard
 * `{ error, code, details }` envelope and throws an {@link ApiError} carrying
 * the server's message (so it reaches the toast) — reusing the exact same
 * {@link apiErrorFromResponse} parser as `fetchApi`. The ok / accepted path
 * returns the typed `ClientResponse` untouched.
 *
 * This works because hc's terminal `$get()`/`$post()`/… return the RAW Response
 * — hc does NOT auto-throw (that's its separate `parseResponse`/`DetailedError`
 * helper, which we deliberately do not use, as it discards the server message).
 * So the structured body is still readable here on the `!res.ok` branch.
 *
 * @param responsePromise The promise returned by a `client.…$method(...)` call.
 * @param errorTitle Full user-facing sentence for the toast on failure (e.g. "Couldn't purge cache").
 * @param acceptStatuses Non-2xx codes to return as-is instead of throwing (intentional control-flow statuses).
 * @returns The resolved `ClientResponse` for ok / accepted statuses.
 */
export async function callApi<Res extends ClientResponse<unknown>>(
  responsePromise: Promise<Res>,
  errorTitle: string,
  acceptStatuses?: readonly number[],
): Promise<Res> {
  const res = await responsePromise;
  if (!res.ok && !acceptStatuses?.includes(res.status)) {
    throw await apiErrorFromResponse(res, errorTitle, { url: res.url });
  }
  return res;
}

/**
 * Same as {@link callApi}, but decodes the JSON body and returns the typed
 * payload inferred from the route's response schema (the core win of the RPC
 * client over `fetchApiJson`'s hand-written generic).
 *
 * The `responsePromise` parameter type rejects a bodyless route (e.g. one whose
 * only success status is 204) at compile time: hc infers such a route's `json()`
 * as `Promise<unknown>`, which would both erase the static type AND crash at
 * runtime (`res.json()` on an empty body throws). For those, use {@link callApi}.
 *
 * No `acceptStatuses` param (unlike {@link callApi}): an intentional non-2xx
 * carries a body that does not match the route's 2xx-inferred type, so accepting
 * one here would mistype the result. Use `callApi` + a manual `res.json()` for
 * endpoints that return a JSON body on a non-2xx control-flow status.
 * @returns The decoded JSON body, typed from the API route.
 */
export async function callApiJson<Res extends ClientResponse<unknown>>(
  responsePromise: unknown extends Awaited<ReturnType<Res["json"]>> ? never : Promise<Res>,
  errorTitle: string,
): Promise<Exclude<Awaited<ReturnType<Res["json"]>>, ApiErrorResponse>> {
  const res = await callApi(responsePromise as Promise<Res>, errorTitle);
  // Routes now declare their 4xx error responses, so hc folds the
  // `{ error, code }` envelope into the `json()` union. `callApi` has already
  // thrown on any non-ok status, so the decoded body is always a success
  // shape — exclude the error envelope from the static type to match.
  return res.json() as Promise<Exclude<Awaited<ReturnType<Res["json"]>>, ApiErrorResponse>>;
}

/**
 * Decode the JSON body of an already-resolved {@link callApi} response, stripping
 * the `{ error, code }` envelope from the static type. Use this (instead of a
 * bare `res.json()`) when a handler uses `callApi` with `acceptStatuses` and has
 * already branched on the intentional non-2xx status itself, so the remaining
 * body is the success shape.
 * @returns The decoded success body, typed without the error envelope.
 */
export function okJson<Res extends ClientResponse<unknown>>(
  res: Res,
): Promise<Exclude<Awaited<ReturnType<Res["json"]>>, ApiErrorResponse>> {
  return res.json() as Promise<Exclude<Awaited<ReturnType<Res["json"]>>, ApiErrorResponse>>;
}
