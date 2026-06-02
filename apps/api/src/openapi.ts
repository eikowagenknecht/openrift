import { OpenAPIHono } from "@hono/zod-openapi";
import type { ApiErrorResponse } from "@openrift/shared";

import { ERROR_CODES } from "./errors.js";
import type { Variables } from "./types.js";

/**
 * Creates an OpenAPIHono router wired with the app's default validation hook.
 *
 * Every route module — and the root app — must build its router via this
 * factory rather than `new OpenAPIHono(...)`. Without a `defaultHook`, the
 * OpenAPI router falls back to the bundled zod-validator default, which on a
 * failed request-schema validation responds with `{ success, error, data }`
 * (status 400, no `code`) — a shape that matches neither the `{ error, code }`
 * envelope every other error uses nor what the OpenAPI spec documents.
 *
 * The hook returns that envelope directly (it does not throw), so a validation
 * failure produces the standard shape even on routers mounted without an
 * `onError`, and matches the manually-thrown `ZodError` path in `app.onError`.
 *
 * @returns A fresh OpenAPIHono typed with the app's {@link Variables}.
 */
export function createApiApp(): OpenAPIHono<{ Variables: Variables }> {
  return new OpenAPIHono<{ Variables: Variables }>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const body: ApiErrorResponse = {
          error: "Invalid request body",
          code: ERROR_CODES.VALIDATION_ERROR,
          details: result.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        };
        return c.json(body, 400);
      }
    },
  });
}
