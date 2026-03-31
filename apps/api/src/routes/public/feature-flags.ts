import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { FeatureFlagsResponse } from "@openrift/shared";
import { featureFlagsResponseSchema } from "@openrift/shared/response-schemas";

import type { Variables } from "../../types.js";

const getFeatureFlags = createRoute({
  method: "get",
  path: "/feature-flags",
  tags: ["Feature Flags"],
  responses: {
    200: {
      content: { "application/json": { schema: featureFlagsResponseSchema } },
      description: "Feature flags map",
    },
  },
});

/** Public: GET /feature-flags — returns `{ flags: { key: enabled } }` map for the client to consume at boot. */
export const featureFlagsRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  getFeatureFlags,
  async (c) => {
    const user = c.get("user");

    if (user) {
      // Authenticated: merge global defaults with per-user overrides.
      const { userFeatureFlags } = c.get("repos");
      const flags = await userFeatureFlags.listMerged(user.id);
      c.header("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
      return c.json({ items: flags } satisfies FeatureFlagsResponse);
    }

    // Anonymous: global defaults only.
    const { featureFlags } = c.get("repos");
    const rows = await featureFlags.listKeyEnabled();
    const flags: Record<string, boolean> = {};
    for (const row of rows) {
      flags[row.key] = row.enabled;
    }
    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json({ items: flags } satisfies FeatureFlagsResponse);
  },
);
