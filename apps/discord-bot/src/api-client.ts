import { catalogContract } from "@openrift/shared/contracts/catalog";
import type { CatalogContract } from "@openrift/shared/contracts/catalog";
import { initContract } from "@openrift/shared/contracts/init";
import type { InitContract } from "@openrift/shared/contracts/init";
import { pricesContract } from "@openrift/shared/contracts/prices";
import type { PricesContract } from "@openrift/shared/contracts/prices";
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";

export interface ApiClients {
  catalog: ContractRouterClient<CatalogContract>;
  init: ContractRouterClient<InitContract>;
  prices: ContractRouterClient<PricesContract>;
}

/**
 * Builds contract-typed oRPC clients for the public reads the bot needs.
 * Same OpenAPILink pattern as the web's `apiOrpcClient`, minus the SSR-only
 * header forwarding (the bot has no visitor context to propagate).
 *
 * @returns Typed clients for the catalog and prices contracts.
 */
export function createApiClients(apiUrl: string): ApiClients {
  return {
    catalog: createORPCClient(new OpenAPILink(catalogContract, { url: apiUrl })),
    init: createORPCClient(new OpenAPILink(initContract, { url: apiUrl })),
    prices: createORPCClient(new OpenAPILink(pricesContract, { url: apiUrl })),
  };
}
