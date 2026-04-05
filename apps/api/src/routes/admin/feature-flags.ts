import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { FeatureFlagResponse } from "@openrift/shared";
import { keyParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { assertDeleted, assertFound } from "../../utils/assertions.js";
import { createFlagSchema, updateFlagSchema } from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const listFlags = createRoute({
  method: "get",
  path: "/feature-flags",
  tags: ["Admin - Feature Flags"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            flags: z.array(
              z.object({
                key: z.string(),
                enabled: z.boolean(),
                description: z.string().nullable(),
                createdAt: z.string(),
                updatedAt: z.string(),
              }),
            ),
          }),
        },
      },
      description: "List feature flags",
    },
  },
});

const createFlag = createRoute({
  method: "post",
  path: "/feature-flags",
  tags: ["Admin - Feature Flags"],
  request: {
    body: { content: { "application/json": { schema: createFlagSchema } } },
  },
  responses: {
    201: { description: "Flag created" },
  },
});

const updateFlag = createRoute({
  method: "patch",
  path: "/feature-flags/{key}",
  tags: ["Admin - Feature Flags"],
  request: {
    params: keyParamSchema,
    body: { content: { "application/json": { schema: updateFlagSchema } } },
  },
  responses: {
    204: { description: "Flag updated" },
  },
});

const deleteFlag = createRoute({
  method: "delete",
  path: "/feature-flags/{key}",
  tags: ["Admin - Feature Flags"],
  request: {
    params: keyParamSchema,
  },
  responses: {
    204: { description: "Flag deleted" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminFeatureFlagsRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /feature-flags ───────────────────────────────────────────────────

  .openapi(listFlags, async (c) => {
    const { featureFlags: flagsRepo } = c.get("repos");
    const rows = await flagsRepo.listAll();
    return c.json({
      flags: rows.map(
        (r): FeatureFlagResponse => ({
          key: r.key,
          enabled: r.enabled,
          description: r.description,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      ),
    });
  })

  // ── POST /feature-flags ──────────────────────────────────────────────────

  .openapi(createFlag, async (c) => {
    const { featureFlags: flagsRepo } = c.get("repos");
    const { key, description, enabled } = c.req.valid("json");

    const created = await flagsRepo.create({
      key,
      enabled: enabled ?? false,
      description: description ?? null,
    });
    if (!created) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Flag "${key}" already exists`);
    }

    return c.body(null, 201);
  })

  // ── PATCH /feature-flags/:key ─────────────────────────────────────────────

  .openapi(updateFlag, async (c) => {
    const { featureFlags: flagsRepo } = c.get("repos");
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");

    const updated = await flagsRepo.update(key, body);
    assertFound(updated, `Flag "${key}" not found`);

    return c.body(null, 204);
  })

  // ── DELETE /feature-flags/:key ────────────────────────────────────────────

  .openapi(deleteFlag, async (c) => {
    const { featureFlags: flagsRepo } = c.get("repos");
    const { key } = c.req.valid("param");

    const result = await flagsRepo.deleteByKey(key);
    assertDeleted(result, `Flag "${key}" not found`);

    return c.body(null, 204);
  });
