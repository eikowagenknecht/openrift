import { catalogContract } from "@openrift/shared/contracts/catalog";
import type { CatalogContract } from "@openrift/shared/contracts/catalog";
import { discordBotContract } from "@openrift/shared/contracts/discord-bot";
import type { DiscordBotContract } from "@openrift/shared/contracts/discord-bot";
import { initContract } from "@openrift/shared/contracts/init";
import type { InitContract } from "@openrift/shared/contracts/init";
import { pricesContract } from "@openrift/shared/contracts/prices";
import type { PricesContract } from "@openrift/shared/contracts/prices";
import { rulesContract } from "@openrift/shared/contracts/rules";
import type { RulesContract } from "@openrift/shared/contracts/rules";
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";

export interface ApiClients {
  catalog: ContractRouterClient<CatalogContract>;
  init: ContractRouterClient<InitContract>;
  prices: ContractRouterClient<PricesContract>;
  rules: ContractRouterClient<RulesContract>;
  discordBot: ContractRouterClient<DiscordBotContract> | null;
}

export function createApiClients(apiUrl: string, apiSecret?: string | null): ApiClients {
  return {
    catalog: createORPCClient(new OpenAPILink(catalogContract, { url: apiUrl })),
    init: createORPCClient(new OpenAPILink(initContract, { url: apiUrl })),
    prices: createORPCClient(new OpenAPILink(pricesContract, { url: apiUrl })),
    rules: createORPCClient(new OpenAPILink(rulesContract, { url: apiUrl })),
    discordBot: apiSecret
      ? createORPCClient(
          new OpenAPILink(discordBotContract, {
            url: apiUrl,
            headers: () => ({ authorization: `Bearer ${apiSecret}` }),
          }),
        )
      : null,
  };
}
