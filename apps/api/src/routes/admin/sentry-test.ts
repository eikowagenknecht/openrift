import type { Context, Hono } from "hono";

import { requireAdmin } from "../../middleware/require-admin.js";
import type { Variables } from "../../types.js";

// Distinct message so it's easy to spot these on Sentry smoke tests vs
// real incidents. Includes a timestamp so repeated clicks don't dedupe
// into a single issue — admins want to see each click land.
function smokeTestError(surface: string): Error {
  return new Error(`Sentry smoke test (${surface}) @ ${new Date().toISOString()}`);
}

/**
 * Mounts `POST /api/admin/v1/sentry-test/throw` (admin-gated). It always throws
 * a plain Error so the global Hono `onError` reports it to Sentry — verifying
 * end-to-end capture. This stays a plain Hono route (not oRPC): oRPC catches
 * handler throws and returns a 500 without reaching `onError`, which would
 * defeat the smoke test.
 * @returns Nothing; registers the route on the passed app.
 */
export function mountAdminSentryTest(app: Hono<{ Variables: Variables }>): void {
  app.use("/api/admin/v1/sentry-test/throw", requireAdmin);
  app.post("/api/admin/v1/sentry-test/throw", (_c: Context<{ Variables: Variables }>) => {
    throw smokeTestError("api");
  });
}
