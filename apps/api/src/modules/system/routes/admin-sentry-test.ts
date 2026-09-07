import type { Context, Hono } from "hono";

import { requireAdmin } from "../../../middleware/require-admin.js";
import type { Variables } from "../../../types.js";

// Timestamped so repeated clicks don't dedupe into a single Sentry issue.
function smokeTestError(surface: string): Error {
  return new Error(`Sentry smoke test (${surface}) @ ${new Date().toISOString()}`);
}

/**
 * Plain Hono route, not oRPC: oRPC catches handler throws before the
 * global `onError` runs.
 */
export function mountAdminSentryTest(app: Hono<{ Variables: Variables }>): void {
  app.use("/api/admin/v1/sentry-test/throw", requireAdmin);
  app.post("/api/admin/v1/sentry-test/throw", (_c: Context<{ Variables: Variables }>) => {
    throw smokeTestError("api");
  });
}
