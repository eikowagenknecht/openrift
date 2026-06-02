import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { createApiApp } from "../../openapi.js";

// ── Route definitions ───────────────────────────────────────────────────────

const listFormats = createRoute({
  method: "get",
  path: "/formats",
  tags: ["Admin - Formats"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            formats: z.array(
              z.object({
                id: z.string().openapi({ example: "standard" }),
                name: z.string().openapi({ example: "Standard" }),
              }),
            ),
          }),
        },
      },
      description: "List all formats",
    },
  },
});

// ── Router ──────────────────────────────────────────────────────────────────

export const adminFormatsRoute = createApiApp().openapi(listFormats, async (c) => {
  const { cardBans } = c.get("repos");
  const formats = await cardBans.listFormats();
  return c.json({ formats });
});
