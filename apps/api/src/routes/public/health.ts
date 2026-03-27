import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { healthResponseSchema } from "@openrift/shared/response-schemas";

import type { Variables } from "../../types.js";

const HEALTH_TIMEOUT_MS = 5000;

const getHealth = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  responses: {
    200: {
      content: { "application/json": { schema: healthResponseSchema } },
      description: "Service is healthy",
    },
    503: {
      content: { "application/json": { schema: healthResponseSchema } },
      description: "Service is unhealthy",
    },
  },
});

export const healthRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  getHealth,
  async (c) => {
    const { health } = c.get("repos");
    const status = await health.healthCheck(HEALTH_TIMEOUT_MS);

    c.header("Cache-Control", "no-store");

    if (status === "ok" || status === "db_empty") {
      return c.json({ status }, 200);
    }

    return c.json({ status }, 503);
  },
);
