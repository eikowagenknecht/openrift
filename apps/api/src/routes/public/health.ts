import { Hono } from "hono";

import type { Variables } from "../../types.js";

const HEALTH_TIMEOUT_MS = 5000;

// Infra/monitoring endpoint — a plain Hono route (not in the OpenAPI doc). The
// liveness probe reads the status code; the JSON body mirrors `healthResponseSchema`.
export const healthRoute = new Hono<{ Variables: Variables }>().get("/health", async (c) => {
  const { health } = c.get("repos");
  const status = await health.healthCheck(HEALTH_TIMEOUT_MS);

  c.header("Cache-Control", "no-store");

  if (status === "ok" || status === "db_empty") {
    return c.json({ status }, 200);
  }

  return c.json({ status }, 503);
});
