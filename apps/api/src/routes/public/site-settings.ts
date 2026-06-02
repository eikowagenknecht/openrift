import { createRoute } from "@hono/zod-openapi";
import type { SiteSettingsResponse } from "@openrift/shared";
import { z } from "zod";

import { createApiApp } from "../../openapi.js";

const getSiteSettings = createRoute({
  method: "get",
  path: "/site-settings",
  tags: ["Site Settings"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            items: z.record(z.string(), z.string()).openapi({ example: { theme: "dark" } }),
          }),
        },
      },
      description: "Web-scoped site settings as a key→value map",
    },
  },
});

/** Public: GET /site-settings — returns web-scoped settings as a `{ items: { key: value } }` map. */
export const siteSettingsRoute = createApiApp().openapi(getSiteSettings, async (c) => {
  const { siteSettings } = c.get("repos");
  const rows = await siteSettings.listByScope("web");

  const items: Record<string, string> = {};
  for (const row of rows) {
    items[row.key] = row.value;
  }
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return c.json({ items } satisfies SiteSettingsResponse);
});
