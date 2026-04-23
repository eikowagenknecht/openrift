import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import type { Variables } from "../../types.js";

// Distinct message so it's easy to spot these on Sentry smoke tests vs
// real incidents. Includes a timestamp so repeated clicks don't dedupe
// into a single issue — admins want to see each click land.
function smokeTestError(surface: string): Error {
  return new Error(`Sentry smoke test (${surface}) @ ${new Date().toISOString()}`);
}

const throwFromApi = createRoute({
  method: "post",
  path: "/sentry-test/throw",
  tags: ["Admin - Operations"],
  responses: {
    500: {
      content: {
        "application/json": {
          schema: z.object({ error: z.string(), code: z.string() }),
        },
      },
      description: "Always throws. Used to verify that Sentry captures API errors end-to-end.",
    },
  },
});

export const adminSentryTestRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  throwFromApi,
  () => {
    throw smokeTestError("api");
  },
);
