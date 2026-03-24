import type { FeatureFlagsResponse } from "@openrift/shared";
import { Hono } from "hono";

import type { Variables } from "../../types.js";

// ── Public: GET /feature-flags ──────────────────────────────────────────────
// Returns { flags: { key: enabled } } map for the client to consume at boot.

export const featureFlagsRoute = new Hono<{ Variables: Variables }>().get(
  "/feature-flags",
  async (c) => {
    const { featureFlags } = c.get("repos");
    const rows = await featureFlags.listKeyEnabled();

    const flags: Record<string, boolean> = {};
    for (const row of rows) {
      flags[row.key] = row.enabled;
    }
    return c.json({ flags } satisfies FeatureFlagsResponse);
  },
);
