import { Hono } from "hono";

import type { Variables } from "../../types.js";

// ── Public: GET /keyword-styles ─────────────────────────────────────────────
// Returns { name: { color, darkText } } map for keyword badge rendering.

export const keywordStylesRoute = new Hono<{ Variables: Variables }>().get(
  "/keyword-styles",
  async (c) => {
    const { keywordStyles } = c.get("repos");
    const rows = await keywordStyles.listAll();

    const styles: Record<string, { color: string; darkText: boolean }> = {};
    for (const row of rows) {
      styles[row.name] = { color: row.color, darkText: row.darkText };
    }
    return c.json(styles);
  },
);
