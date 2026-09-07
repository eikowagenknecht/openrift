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

// `url` must stay a function: reading `location` per-call (not at link-build time) keeps
// building this client at module scope safe during SSR, where `location` is undefined.
export function browserApiOrpcClient<TContract extends AnyContractRouter>(
  contract: TContract,
): ContractRouterClient<TContract> {
  const link = new OpenAPILink(contract, { url: () => globalThis.location.origin });
  return createORPCClient(withProcedureTag(link));
}

export type ContractInput<
  TContract extends AnyContractRouter,
  TProcedure extends keyof InferContractRouterInputs<TContract>,
> = InferContractRouterInputs<TContract>[TProcedure];
