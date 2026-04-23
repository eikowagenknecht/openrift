import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { createLogger } from "@openrift/shared/logger";
import { z } from "zod";

import { flushPendingPrintingEvents } from "../../services/flush-printing-events.js";
import type { Variables } from "../../types.js";

const log = createLogger("admin");

// ── Route definitions ───────────────────────────────────────────────────────

const flushPrintingEvents = createRoute({
  method: "post",
  path: "/printing-events/flush",
  tags: ["Admin - Operations"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            sent: z.number().openapi({ example: 5 }),
            failed: z.number().openapi({ example: 0 }),
          }),
        },
      },
      description: "Pending printing events flushed to Discord",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminPrintingEventsRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  flushPrintingEvents,
  async (c) => {
    const repos = c.get("repos");
    const config = c.get("config");
    const result = await flushPendingPrintingEvents(repos, config.appBaseUrl, log);
    return c.json(result);
  },
);
