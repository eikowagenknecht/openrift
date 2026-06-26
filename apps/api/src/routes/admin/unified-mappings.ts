import { adminUnifiedMappingsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { saveMappings, unmapPrinting } from "../../services/marketplace-mapping.js";
import {
  buildUnifiedMappingsCardResponse,
  buildUnifiedMappingsResponse,
} from "../../services/unified-mapping-merge.js";
import { createMarketplaceConfigs } from "./marketplace-configs.js";

const os = implement(adminUnifiedMappingsContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the admin unified marketplace-mappings. Logic
 * unchanged from the previous `@hono/zod-openapi` handlers; `save` (query +
 * body) and `unmap` (query) use detailed input structure. Any thrown
 * `AppError` is mapped by the handler's {@link appErrorInterceptor}.
 */
export const adminUnifiedMappingsRouter = {
  list: os.list.handler(async ({ context }) => {
    const repos = context.repos;
    const { getMappingOverview } = context.services;
    const { tcgplayer, cardmarket, cardtrader } = createMarketplaceConfigs(repos);
    return await buildUnifiedMappingsResponse(
      repos,
      tcgplayer,
      cardmarket,
      cardtrader,
      getMappingOverview,
    );
  }),

  card: os.card.handler(async ({ input, context }) => {
    const repos = context.repos;
    const { tcgplayer, cardmarket, cardtrader } = createMarketplaceConfigs(repos);
    return await buildUnifiedMappingsCardResponse(
      repos,
      tcgplayer,
      cardmarket,
      cardtrader,
      input.cardId,
    );
  }),

  save: os.save.handler(async ({ input, context }) => {
    const repos = context.repos;
    const transact = context.transact;
    const configs = createMarketplaceConfigs(repos);
    const config = configs[input.query.marketplace];
    return await saveMappings(transact, config, input.body.mappings);
  }),

  unmap: os.unmap.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const transact = context.transact;
    const { marketplace, printingId, externalId, finish, language } = input.query;
    const configs = createMarketplaceConfigs(repos);
    const config = configs[marketplace];
    await unmapPrinting(transact, config, printingId, externalId, finish, language ?? null);
  }),
};
