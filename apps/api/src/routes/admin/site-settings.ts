import { ERROR_CODES } from "@openrift/shared";
import type { SiteSettingResponse } from "@openrift/shared";
import { adminSiteSettingsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { assertDeleted, assertFound } from "../../utils/assertions.js";

const os = implement(adminSiteSettingsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin site-settings CRUD. Conflict / not-found states are thrown as
 * `AppError` and mapped by the handler's {@link appErrorInterceptor}.
 */
export const adminSiteSettingsRouter = {
  list: os.list.handler(async ({ context }) => {
    const { siteSettings } = context.repos;
    const rows = await siteSettings.listAll();
    return {
      settings: rows.map(
        (r): SiteSettingResponse => ({
          key: r.key,
          value: r.value,
          scope: r.scope,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      ),
    };
  }),

  create: os.create.handler(async ({ input, context }): Promise<void> => {
    const { siteSettings } = context.repos;
    const { key, value, scope } = input;
    const created = await siteSettings.create({ key, value, scope: scope ?? "web" });
    if (!created) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Setting "${key}" already exists`);
    }
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { siteSettings } = context.repos;
    const { key, ...body } = input;
    const updated = await siteSettings.update(key, body);
    assertFound(updated, `Setting "${key}" not found`);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { siteSettings } = context.repos;
    const result = await siteSettings.deleteByKey(input.key);
    assertDeleted(result, `Setting "${input.key}" not found`);
  }),
};
