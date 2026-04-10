import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { assertDeleted } from "../../utils/assertions.js";
import { upsertOverrideSchema, userIdParamSchema, userKeyParamSchema } from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const listAllOverrides = createRoute({
  method: "get",
  path: "/feature-flags/overrides",
  tags: ["Admin - Feature Flags"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            overrides: z.array(
              z.object({
                userId: z.string().openapi({ example: "V07rIX7hwiXgRxHwxo1HtV1ybv8Z7iyK" }),
                userName: z.string().nullable().openapi({ example: "Eiko Wagenknecht" }),
                userEmail: z.string().openapi({ example: "eiko@example.com" }),
                flagKey: z.string().openapi({ example: "collection" }),
                enabled: z.boolean().openapi({ example: true }),
              }),
            ),
          }),
        },
      },
      description: "List all per-user feature flag overrides",
    },
  },
});

const listUserOverrides = createRoute({
  method: "get",
  path: "/users/{id}/feature-flags",
  tags: ["Admin - Feature Flags"],
  request: { params: userIdParamSchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            overrides: z.array(
              z.object({
                flagKey: z.string().openapi({ example: "collection" }),
                enabled: z.boolean().openapi({ example: true }),
              }),
            ),
          }),
        },
      },
      description: "List feature flag overrides for a user",
    },
  },
});

const upsertUserOverride = createRoute({
  method: "put",
  path: "/users/{id}/feature-flags/{key}",
  tags: ["Admin - Feature Flags"],
  request: {
    params: userKeyParamSchema,
    body: { content: { "application/json": { schema: upsertOverrideSchema } } },
  },
  responses: {
    200: { description: "Override set" },
  },
});

const deleteUserOverride = createRoute({
  method: "delete",
  path: "/users/{id}/feature-flags/{key}",
  tags: ["Admin - Feature Flags"],
  request: { params: userKeyParamSchema },
  responses: {
    204: { description: "Override removed" },
  },
});

// ── Router ──────────────────────────────────────────────────────────────────

export const adminUserFeatureFlagsRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /feature-flags/overrides ────────────────────────────────────────
  .openapi(listAllOverrides, async (c) => {
    const { userFeatureFlags } = c.get("repos");
    const rows = await userFeatureFlags.listAllWithUsers();
    return c.json({ overrides: rows });
  })

  // ── GET /users/:id/feature-flags ────────────────────────────────────────
  .openapi(listUserOverrides, async (c) => {
    const { userFeatureFlags } = c.get("repos");
    const { id } = c.req.valid("param");

    const rows = await userFeatureFlags.listByUser(id);
    return c.json({
      overrides: rows.map((r) => ({ flagKey: r.flagKey, enabled: r.enabled })),
    });
  })

  // ── PUT /users/:id/feature-flags/:key ───────────────────────────────────
  .openapi(upsertUserOverride, async (c) => {
    const { userFeatureFlags } = c.get("repos");
    const { id, key } = c.req.valid("param");
    const { enabled } = c.req.valid("json");

    const result = await userFeatureFlags.upsert(id, key, enabled);
    if (!result) {
      throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, "Failed to set override");
    }

    return c.json({ flagKey: key, enabled });
  })

  // ── DELETE /users/:id/feature-flags/:key ────────────────────────────────
  .openapi(deleteUserOverride, async (c) => {
    const { userFeatureFlags } = c.get("repos");
    const { id, key } = c.req.valid("param");

    const result = await userFeatureFlags.delete(id, key);
    assertDeleted(result, `Override for flag "${key}" not found for this user`);

    return c.body(null, 204);
  });
