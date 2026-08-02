import type { FeatureFlagsResponse } from "@openrift/shared";
import { featureFlagsContract } from "@openrift/shared/contracts/feature-flags";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(featureFlagsContract).$context<ApiContext>().use(requireUser);

/**
 * Public feature-flags read.
 *
 * `GET /api/v1/feature-flags` — returns `{ flags: { key: enabled } }`. When a
 * session is present the per-user overrides are merged over the global
 * defaults; anonymous callers get the global defaults only.
 */
export const featureFlagsRouter = {
  get: os.get.handler(async ({ context }): Promise<FeatureFlagsResponse> => {
    const user = context.user;

    if (user) {
      // Authenticated: merge global defaults with per-user overrides.
      const { userFeatureFlags } = context.repos;
      const flags = await userFeatureFlags.listMerged(user.id);
      return { flags };
    }

    // Anonymous: global defaults only.
    const { featureFlags } = context.repos;
    const rows = await featureFlags.listKeyEnabled();
    const flags: Record<string, boolean> = {};
    for (const row of rows) {
      flags[row.key] = row.enabled;
    }
    return { flags };
  }),
};
