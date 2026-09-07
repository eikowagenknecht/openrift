import { siteSettingsContract } from "@openrift/shared/contracts/site-settings";
import type { SiteSettingsResponse } from "@openrift/shared/types/api/site-settings";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(siteSettingsContract).$context<ApiContext>().use(requireUser);

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
