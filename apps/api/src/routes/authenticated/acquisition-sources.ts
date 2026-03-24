import { zValidator } from "@hono/zod-validator";
import type { AcquisitionSourceListResponse } from "@openrift/shared";
import {
  createAcquisitionSourceSchema,
  idParamSchema,
  updateAcquisitionSourceSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { Variables } from "../../types.js";
import { toSource } from "../../utils/mappers.js";

const patchFields: FieldMapping = { name: "name", description: "description" };

export const acquisitionSourcesRoute = new Hono<{ Variables: Variables }>()
  .basePath("/acquisition-sources")
  .use(requireAuth)

  // ── LIST ────────────────────────────────────────────────────────────────────
  .get("/", async (c) => {
    const { acquisitionSources } = c.get("repos");
    const rows = await acquisitionSources.listForUser(getUserId(c));
    return c.json({
      items: rows.map((row) => toSource(row)),
    } satisfies AcquisitionSourceListResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .post("/", zValidator("json", createAcquisitionSourceSchema), async (c) => {
    const { acquisitionSources } = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await acquisitionSources.create({
      userId,
      name: body.name,
      description: body.description ?? null,
    });
    return c.json(toSource(row), 201);
  })

  // ── GET ONE ─────────────────────────────────────────────────────────────────
  .get("/:id", zValidator("param", idParamSchema), async (c) => {
    const { acquisitionSources } = c.get("repos");
    const { id } = c.req.valid("param");
    const row = await acquisitionSources.getByIdForUser(id, getUserId(c));
    if (!row) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json(toSource(row));
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .patch(
    "/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateAcquisitionSourceSchema),
    async (c) => {
      const { acquisitionSources } = c.get("repos");
      const userId = getUserId(c);
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const updates = buildPatchUpdates(body, patchFields);
      const row = await acquisitionSources.update(id, userId, updates);
      if (!row) {
        throw new AppError(404, "NOT_FOUND", "Not found");
      }
      return c.json(toSource(row));
    },
  )

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .delete("/:id", zValidator("param", idParamSchema), async (c) => {
    const { acquisitionSources } = c.get("repos");
    const { id } = c.req.valid("param");
    const result = await acquisitionSources.deleteByIdForUser(id, getUserId(c));
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.body(null, 204);
  });
