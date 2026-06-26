import type { SiteSettingsResponse } from "@openrift/shared";
import { siteSettingsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(siteSettingsContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the public site-settings contract.
 * `GET /api/v1/site-settings` — web-scoped settings as a `{ key: value }` map.
 */
export const siteSettingsRouter = {
  get: os.get.handler(async ({ context }): Promise<SiteSettingsResponse> => {
    const { siteSettings } = context.repos;
    const rows = await siteSettings.listByScope("web");
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return { settings };
  }),
};
