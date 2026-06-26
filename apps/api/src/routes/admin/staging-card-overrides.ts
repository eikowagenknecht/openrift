import { adminStagingCardOverridesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminStagingCardOverridesContract).$context<ApiContext>().use(requireUser);

/**
 * Admin staging-card-overrides. Any thrown `AppError` is mapped by the
 * handler's {@link appErrorInterceptor}. The DELETE reads its SKU key from
 * detailed `query` input (compact mode drops DELETE query params).
 */
export const adminStagingCardOverridesRouter = {
  create: os.create.handler(async ({ input, context }): Promise<void> => {
    const { marketplaceAdmin: mktAdmin } = context.repos;
    const { marketplace, externalId, finish, language, cardId } = input;
    await mktAdmin.upsertStagingCardOverride({
      marketplace,
      externalId,
      finish,
      language,
      cardId,
    });
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { marketplaceAdmin: mktAdmin } = context.repos;
    const { marketplace, externalId, finish, language } = input.query;
    await mktAdmin.deleteStagingCardOverride(marketplace, externalId, finish, language ?? null);
  }),
};
