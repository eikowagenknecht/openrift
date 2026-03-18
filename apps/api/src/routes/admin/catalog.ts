import { zValidator } from "@hono/zod-validator";
import type { AdminSetResponse, MarketplaceGroupResponse } from "@openrift/shared";
import { slugParamSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";
import { z } from "zod/v4";

import { setFieldRules } from "../../db/schemas.js";
import { AppError } from "../../errors.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const marketplaceParamSchema = z.object({
  marketplace: z.enum(["cardmarket", "tcgplayer"]),
});

const numericIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const updateGroupNameSchema = z.object({
  name: z.string().nullable(),
});

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
  ids: z.array(z.string()).min(1),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const catalogRoute = new Hono<{ Variables: Variables }>()
  .basePath("/admin")

  // ── Marketplace Groups ──────────────────────────────────────────────────────

  .get(
    "/:marketplace{cardmarket|tcgplayer}-groups",
    zValidator("param", marketplaceParamSchema),
    async (c) => {
      const { marketplaceAdmin: mktAdmin } = c.get("repos");
      const { marketplace } = c.req.valid("param");

      const [groups, stagingCounts, assignedCounts] = await Promise.all([
        mktAdmin.listGroupsByMarketplace(marketplace),
        mktAdmin.stagingCountsByMarketplaceGroup(marketplace),
        mktAdmin.assignedCountsByMarketplaceGroup(marketplace),
      ]);

      const countMap = new Map(stagingCounts.map((r) => [r.groupId, r.count]));
      const assignedMap = new Map(assignedCounts.map((r) => [r.groupId, r.count]));

      const items: MarketplaceGroupResponse[] = groups.map((g) => ({
        marketplace,
        groupId: g.groupId,
        name: g.name,
        abbreviation: g.abbreviation,
        stagedCount: countMap.get(g.groupId) ?? 0,
        assignedCount: assignedMap.get(g.groupId) ?? 0,
      }));
      return c.json({ groups: items });
    },
  )

  // Only cardmarket groups have editable names — tcgplayer group names come
  // preset from the marketplace feed and are not user-editable.
  .patch(
    "/cardmarket-groups/:id",
    zValidator("param", numericIdParamSchema),
    zValidator("json", updateGroupNameSchema),
    async (c) => {
      const { marketplaceAdmin: mktAdmin } = c.get("repos");
      const { id } = c.req.valid("param");
      const { name } = c.req.valid("json");

      await mktAdmin.updateGroupName("cardmarket", id, name);

      return c.body(null, 204);
    },
  )

  // ── Sets CRUD ─────────────────────────────────────────────────────────────────

  .get("/sets", async (c) => {
    const { sets: setsRepo } = c.get("repos");

    const [sets, cardCounts, printingCounts] = await Promise.all([
      setsRepo.listAll(),
      setsRepo.cardCountsBySet(),
      setsRepo.printingCountsBySet(),
    ]);

    const cardCountMap = new Map(cardCounts.map((r) => [r.setId, Number(r.cardCount)]));
    const printingCountMap = new Map(printingCounts.map((r) => [r.setId, Number(r.printingCount)]));

    const items: AdminSetResponse[] = sets.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      printedTotal: s.printedTotal,
      sortOrder: s.sortOrder,
      releasedAt: s.releasedAt ?? null,
      cardCount: cardCountMap.get(s.id) ?? 0,
      printingCount: printingCountMap.get(s.id) ?? 0,
    }));
    return c.json({ sets: items });
  })

  .patch(
    "/sets/:id",
    zValidator("param", slugParamSchema),
    zValidator("json", updateSetSchema),
    async (c) => {
      const { sets: setsRepo } = c.get("repos");
      const { id } = c.req.valid("param");
      const { name, printedTotal, releasedAt } = c.req.valid("json");

      await setsRepo.update(id, { name, printedTotal, releasedAt });

      return c.body(null, 204);
    },
  )

  .post("/sets", zValidator("json", createSetSchema), async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { id, name, printedTotal, releasedAt } = c.req.valid("json");

    const created = await setsRepo.createIfNotExists({ slug: id, name, printedTotal, releasedAt });
    if (!created) {
      throw new AppError(409, "CONFLICT", `Set with ID "${id}" already exists`);
    }

    return c.body(null, 201);
  })

  .delete("/sets/:id", zValidator("param", slugParamSchema), async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { id } = c.req.valid("param");

    const set = await setsRepo.getBySlug(id);
    if (!set) {
      throw new AppError(404, "NOT_FOUND", `Set "${id}" not found`);
    }

    const [cardCount, printingCount] = await Promise.all([
      setsRepo.cardCount(set.id),
      setsRepo.printingCount(set.id),
    ]);

    if (printingCount > 0) {
      throw new AppError(
        409,
        "CONFLICT",
        `Cannot delete set "${id}" — it still has ${printingCount} printing(s). Remove them first.`,
      );
    }

    if (cardCount > 0) {
      throw new AppError(
        409,
        "CONFLICT",
        `Cannot delete set "${id}" — it still has ${cardCount} card(s) linked via printings. Remove them first.`,
      );
    }

    await setsRepo.deleteBySlug(id);

    return c.body(null, 204);
  })

  // ── Set reorder ───────────────────────────────────────────────────────────────

  .put("/sets/reorder", zValidator("json", reorderSetsSchema), async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { ids } = c.req.valid("json");

    const allSets = await setsRepo.listAll();
    if (ids.length !== allSets.length) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        `Expected ${allSets.length} set IDs but received ${ids.length}. All sets must be included in the reorder.`,
      );
    }

    await setsRepo.reorder(ids);
    return c.body(null, 204);
  });
