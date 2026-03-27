import type { SiteSettingsResponse } from "@openrift/shared";
import { Hono } from "hono";

import type { Variables } from "../../types.js";

/** Public: GET /site-settings — returns web-scoped settings as a `{ items: { key: value } }` map. */
export const siteSettingsRoute = new Hono<{ Variables: Variables }>().get(
  "/site-settings",
  async (c) => {
    const { siteSettings } = c.get("repos");
    const rows = await siteSettings.listByScope("web");

    const items: Record<string, string> = {};
    for (const row of rows) {
      items[row.key] = row.value;
    }
    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json({ items } satisfies SiteSettingsResponse);
  },
);
