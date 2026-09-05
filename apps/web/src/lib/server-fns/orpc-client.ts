import { context, propagation } from "@opentelemetry/api";
import type { ClientContext, ClientLink } from "@orpc/client";
import { createORPCClient } from "@orpc/client";
import type {
  AnyContractRouter,
  ContractRouterClient,
  InferContractRouterInputs,
} from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";

import { tagProcedure } from "@/lib/orpc-procedure-tag";

import { getApiUrl } from "./api-url";
import { activeClientIp } from "./client-ip-context";

/**
 * Wraps a link so a rejected call carries the procedure it was made against.
 * See {@link tagProcedure} for why the error alone is not enough to tell one
 * endpoint's fault from another's.
 * @returns The wrapped link.
 */
function withProcedureTag<TContext extends ClientContext>(
  link: ClientLink<TContext>,
): ClientLink<TContext> {
  return {
    call: async (path, input, options) => {
      try {
        return await link.call(path, input, options);
      } catch (error) {
        tagProcedure(error, path);
        throw error;
      }
    },
  };
}

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
  return createORPCClient(withProcedureTag(link));
}

/**
 * Browser-side counterpart to {@link apiOrpcClient} for calling the API DIRECTLY
 * from the browser (not from a server function): same-origin, so the session
 * cookie is sent automatically and no header forwarding / trace injection is
 * needed. The base is `window.location.origin` (absolute, same-origin).
 *
 * The link's `url` is a function, so `globalThis.location` is read per request
 * rather than when the link is built. That is what makes it safe to build a
 * client at module scope in a module the server also imports: constructing one
 * during SSR is inert, and only an actual call — which never happens on the
 * server — touches `location`.
 * @returns A contract-typed client bound to the current page origin.
 */
export function browserApiOrpcClient<TContract extends AnyContractRouter>(
  contract: TContract,
): ContractRouterClient<TContract> {
  const link = new OpenAPILink(contract, { url: () => globalThis.location.origin });
  return createORPCClient(withProcedureTag(link));
}

/**
 * The input one contract procedure validates. A server function that forwards
 * its payload straight to {@link apiOrpcClient} types its `.validator` with
 * this rather than restating the body's fields, so the two can't drift.
 */
export type ContractInput<
  TContract extends AnyContractRouter,
  TProcedure extends keyof InferContractRouterInputs<TContract>,
> = InferContractRouterInputs<TContract>[TProcedure];
