import { zValidator } from "@hono/zod-validator";
import type { AdminSetResponse, MarketplaceGroupResponse } from "@openrift/shared";
import { slugParamSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";
import { z } from "zod/v4";

import { setFieldRules } from "../../db/schemas.js";
import { AppError } from "../../errors.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const updateExpansionSchema = z.object({
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

  // ── Cardmarket Expansions ────────────────────────────────────────────────────

  .get("/admin/cardmarket-groups", async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");

    const [expansions, stagingCounts, assignedCounts] = await Promise.all([
      mktAdmin.listGroupsByMarketplace("cardmarket", "groupId"),
      mktAdmin.stagingCountsByMarketplaceGroup("cardmarket"),
      mktAdmin.assignedCountsByMarketplaceGroup("cardmarket"),
    ]);

    const countMap = new Map(stagingCounts.map((r) => [r.groupId, r.count]));
    const assignedMap = new Map(assignedCounts.map((r) => [r.groupId, r.count]));

    const items: MarketplaceGroupResponse[] = expansions.map((e) => ({
      marketplace: "cardmarket",
      groupId: e.groupId,
      name: e.name,
      abbreviation: null,
      stagedCount: countMap.get(e.groupId) ?? 0,
      assignedCount: assignedMap.get(e.groupId) ?? 0,
    }));
    return c.json({ expansions: items });
  })

  .patch(
    "/admin/cardmarket-groups/:id",
    zValidator("param", slugParamSchema),
    zValidator("json", updateExpansionSchema),
    async (c) => {
      const { marketplaceAdmin: mktAdmin } = c.get("repos");
      const expansionId = Number(c.req.valid("param").id);
      const { name } = c.req.valid("json");

      await mktAdmin.updateGroupName("cardmarket", expansionId, name);

      return c.body(null, 204);
    },
  )

  // ── TCGPlayer Groups ─────────────────────────────────────────────────────────

  .get("/admin/tcgplayer-groups", async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");

    const [groups, stagingCounts, assignedCounts] = await Promise.all([
      mktAdmin.listGroupsByMarketplace("tcgplayer", "name"),
      mktAdmin.stagingCountsByMarketplaceGroup("tcgplayer"),
      mktAdmin.assignedCountsByMarketplaceGroup("tcgplayer"),
    ]);

    const countMap = new Map(stagingCounts.map((r) => [r.groupId, r.count]));
    const assignedMap = new Map(assignedCounts.map((r) => [r.groupId, r.count]));

    const items: MarketplaceGroupResponse[] = groups.map((g) => ({
      marketplace: "tcgplayer",
      groupId: g.groupId,
      name: g.name,
      abbreviation: g.abbreviation,
      stagedCount: countMap.get(g.groupId) ?? 0,
      assignedCount: assignedMap.get(g.groupId) ?? 0,
    }));
    return c.json({ groups: items });
  })

  // ── Sets CRUD ─────────────────────────────────────────────────────────────────

  .get("/admin/sets", async (c) => {
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
      releasedAt:
        (s.releasedAt as unknown) instanceof Date
          ? (s.releasedAt as unknown as Date).toISOString().slice(0, 10)
          : (s.releasedAt ?? null),
      cardCount: cardCountMap.get(s.id) ?? 0,
      printingCount: printingCountMap.get(s.id) ?? 0,
    }));
    return c.json({ sets: items });
  })

  .patch(
    "/admin/sets/:id",
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

  .post("/admin/sets", zValidator("json", createSetSchema), async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { id, name, printedTotal, releasedAt } = c.req.valid("json");

    const existing = await setsRepo.getBySlug(id);
    if (existing) {
      throw new AppError(409, "CONFLICT", `Set with ID "${id}" already exists`);
    }

    const sortOrder = await setsRepo.nextSortOrder();
    await setsRepo.create({ slug: id, name, printedTotal, releasedAt, sortOrder });

    return c.body(null, 204);
  })

  .delete("/admin/sets/:id", zValidator("param", slugParamSchema), async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { id } = c.req.valid("param");

    const set = await setsRepo.getBySlug(id);
    if (!set) {
      throw new AppError(404, "NOT_FOUND", `Set "${id}" not found`);
    }

    const count = await setsRepo.printingCount(set.id);
    if (count > 0) {
      throw new AppError(
        409,
        "CONFLICT",
        `Cannot delete set "${id}" — it still has ${count} printing(s). Remove them first.`,
      );
    }

    await setsRepo.deleteBySlug(id);

    return c.body(null, 204);
  })

  // ── Set reorder ───────────────────────────────────────────────────────────────

  .put("/admin/sets/reorder", zValidator("json", reorderSetsSchema), async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { ids } = c.req.valid("json");
    await setsRepo.reorder(ids);
    return c.body(null, 204);
  });
