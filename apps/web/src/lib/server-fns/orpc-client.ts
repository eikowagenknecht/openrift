import { context, propagation } from "@opentelemetry/api";
import { createORPCClient } from "@orpc/client";
import type { AnyContractRouter, ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";

import { getApiUrl } from "./api-url";
import { activeClientIp } from "./client-ip-context";

/**
 * Builds the per-request header set for an oRPC OpenAPI link, mirroring the SSR
 * request handling of the old `hc` server client: forward the SSR request's
 * cookie, inject the active W3C traceparent so the API continues the trace,
 * and pass the real visitor IP through for the API's logs / rate limiters.
 * @returns A plain header record for this request.
 */
function requestHeaders(cookie?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) {
    headers.cookie = cookie;
  }
  propagation.inject(context.active(), headers);
  const clientIp = activeClientIp();
  if (clientIp !== undefined) {
    headers["x-real-ip"] = clientIp;
  }
  return headers;
}

/**
 * Builds a contract-typed oRPC client for an endpoint migrated off the Hono
 * `AppType` graph. The OpenAPI link resolves each call's HTTP method + path
 * from the contract value and composes `getApiUrl() + path`, so the request URL
 * is byte-identical to the old `hc` call.
 *
 * This is the migration counterpart to `serverApiClient(...).api.v1[...]`:
 * pass the endpoint's contract (from `@openrift/shared/contracts`) and the
 * SSR request cookie. Works in both the SSR (cookie forwarded) and browser
 * (same-origin cookie sent automatically, pass no cookie) paths.
 * @returns A contract-typed client for the given contract.
 */
export function apiOrpcClient<TContract extends AnyContractRouter>(
  contract: TContract,
  cookie?: string,
): ContractRouterClient<TContract> {
  const link = new OpenAPILink(contract, {
    url: getApiUrl(),
    headers: () => requestHeaders(cookie),
  });
  return createORPCClient(link);
}

/**
 * Browser-side counterpart to {@link apiOrpcClient} for calling the API DIRECTLY
 * from the browser (not from a server function): same-origin, so the session
 * cookie is sent automatically and no header forwarding / trace injection is
 * needed. The base is `window.location.origin` (absolute, same-origin).
 *
 * Importing this module on the server is safe (`globalThis.location` is read
 * lazily); only CALL this from a browser-only path.
 * @returns A contract-typed client bound to the current page origin.
 */
export function browserApiOrpcClient<TContract extends AnyContractRouter>(
  contract: TContract,
): ContractRouterClient<TContract> {
  const link = new OpenAPILink(contract, { url: globalThis.location.origin });
  return createORPCClient(link);
}
