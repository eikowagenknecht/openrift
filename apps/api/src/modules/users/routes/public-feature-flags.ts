import { featureFlagsContract } from "@openrift/shared/contracts/feature-flags";
import type { FeatureFlagsResponse } from "@openrift/shared/types/api/feature-flags";
import { implement } from "@orpc/server";

import { requireUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";

const os = implement(featureFlagsContract).$context<ApiContext>().use(requireUser);

export const featureFlagsRouter = {
  get: os.get.handler(async ({ context }): Promise<FeatureFlagsResponse> => {
    const user = context.user;

    if (user) {
      const { userFeatureFlags } = context.repos;
      const flags = await userFeatureFlags.listMerged(user.id);
      return { flags };
    }

    const { featureFlags } = context.repos;
    const rows = await featureFlags.listKeyEnabled();
    const flags: Record<string, boolean> = {};
    for (const row of rows) {
      flags[row.key] = row.enabled;
    }
    return { flags };
  }),
};
