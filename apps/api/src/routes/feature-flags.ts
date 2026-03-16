import { Hono } from "hono";

import { featureFlagsRepo } from "../repositories/feature-flags.js";
import type { Variables } from "../types.js";

// ── Public: GET /feature-flags ──────────────────────────────────────────────
// Returns { key: enabled } map for the client to consume at boot.

export const featureFlagsRoute = new Hono<{ Variables: Variables }>().get(
  "/feature-flags",
  async (c) => {
    const flagsRepo = featureFlagsRepo(c.get("db"));
    const rows = await flagsRepo.listKeyEnabled();

    const flags: Record<string, boolean> = {};
    for (const row of rows) {
      flags[row.key] = row.enabled;
    }
    return c.json(flags);
  },
);
