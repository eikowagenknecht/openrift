import { ERROR_CODES } from "@openrift/shared";
import type { ProviderSettingResponse } from "@openrift/shared";
import { adminProviderSettingsContract } from "@openrift/shared/contracts/admin/provider-settings";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminProviderSettingsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin provider-settings. Bad-request states are thrown as `AppError` and
 * mapped by the handler's {@link appErrorInterceptor}.
 */
export const adminProviderSettingsRouter = {
  list: os.list.handler(async ({ context }) => {
    const { providerSettings: repo } = context.repos;
    const rows = await repo.listAll();
    return {
      providerSettings: rows.map((r): ProviderSettingResponse => ({
        provider: r.provider,
        sortOrder: r.sortOrder,
        isHidden: r.isHidden,
        isFavorite: r.isFavorite,
        helperReviewable: r.helperReviewable,
      })),
    };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { providerSettings: repo } = context.repos;
    const { providers } = input;

    const uniqueProviders = new Set(providers);
    if (uniqueProviders.size !== providers.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate providers in reorder list");
    }

    await repo.reorder(providers);
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { providerSettings: repo } = context.repos;
    const { provider, ...body } = input;
    await repo.upsert(provider, body);
  }),
};
