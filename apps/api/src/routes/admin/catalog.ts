import { zValidator } from "@hono/zod-validator";
import type { AdminSetResponse } from "@openrift/shared";
import { idParamSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";
import { z } from "zod/v4";

import { setFieldRules } from "../../db/schemas.js";
import { AppError } from "../../errors.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const updateSetSchema = z.object({
  name: setFieldRules.name,
  printedTotal: setFieldRules.printedTotal,
  releasedAt: z.string().nullable(),
});

const createSetSchema = z.object({
  id: setFieldRules.slug,
  name: setFieldRules.name,
  printedTotal: setFieldRules.printedTotal,
  releasedAt: z.string().nullable().optional(),
});

const reorderSetsSchema = z.object({
  ids: z.array(z.uuid()).min(1),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const catalogRoute = new Hono<{ Variables: Variables }>()

  // ── Sets CRUD ─────────────────────────────────────────────────────────────────

  .get("/sets", async (c) => {
    const { sets: setsRepo } = c.get("repos");

    const [sets, cardCounts, printingCounts] = await Promise.all([
      setsRepo.listAll(),
      setsRepo.cardCountsBySet(),
      setsRepo.printingCountsBySet(),
    ]);

    const cardCountMap = new Map(cardCounts.map((r) => [r.setId, r.cardCount]));
    const printingCountMap = new Map(printingCounts.map((r) => [r.setId, r.printingCount]));

    return c.json({
      sets: sets.map(
        (s): AdminSetResponse => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          printedTotal: s.printedTotal,
          sortOrder: s.sortOrder,
          releasedAt: s.releasedAt,
          cardCount: cardCountMap.get(s.id) ?? 0,
          printingCount: printingCountMap.get(s.id) ?? 0,
        }),
      ),
    });
  })

  .patch(
    "/sets/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updateSetSchema),
    async (c) => {
      const { sets: setsRepo } = c.get("repos");
      const { id } = c.req.valid("param");
      const { name, printedTotal, releasedAt } = c.req.valid("json");

      const updated = await setsRepo.update(id, { name, printedTotal, releasedAt });
      if (!updated) {
        throw new AppError(404, "NOT_FOUND", `Set "${id}" not found`);
      }

      return c.body(null, 204);
    },
  )

  .post("/sets", zValidator("json", createSetSchema), async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { id, name, printedTotal, releasedAt } = c.req.valid("json");

    const setId = await setsRepo.createIfNotExists({ slug: id, name, printedTotal, releasedAt });
    if (!setId) {
      throw new AppError(409, "CONFLICT", `Set with ID "${id}" already exists`);
    }

    return c.json({ id: setId }, 201);
  })

  .delete("/sets/:id", zValidator("param", idParamSchema), async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { id } = c.req.valid("param");

    const printingCount = await setsRepo.printingCount(id);
    if (printingCount > 0) {
      throw new AppError(
        409,
        "CONFLICT",
        `Cannot delete set "${id}" — it still has ${printingCount} printing(s). Remove them first.`,
      );
    }

    await setsRepo.deleteById(id);

    return c.body(null, 204);
  })

  // ── Set reorder ───────────────────────────────────────────────────────────────

  .put("/sets/reorder", zValidator("json", reorderSetsSchema), async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { ids } = c.req.valid("json");

    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new AppError(400, "BAD_REQUEST", "Duplicate set IDs in reorder list.");
    }

    const allSets = await setsRepo.listAll();
    if (ids.length !== allSets.length) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        `Expected ${allSets.length} set IDs but received ${ids.length}. All sets must be included in the reorder.`,
      );
    }

    const knownIds = new Set(allSets.map((s) => s.id));
    const unknown = ids.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new AppError(400, "BAD_REQUEST", `Unknown set IDs: ${unknown.join(", ")}`);
    }

    await setsRepo.reorder(ids);
    return c.body(null, 204);
  });
