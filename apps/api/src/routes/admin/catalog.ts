import { zValidator } from "@hono/zod-validator";
import type { AdminSetResponse, MarketplaceGroupResponse } from "@openrift/shared";
import { slugParamSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";
import { z } from "zod/v4";

import { setFieldRules } from "../../db/schemas.js";
import { AppError } from "../../errors.js";
import { requireAdmin } from "../../middleware/require-admin.js";
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

  .use("/admin/cardmarket-groups", requireAdmin)

  .get("/admin/cardmarket-groups", async (c) => {
    const db = c.get("db");
    const expansions = await db
      .selectFrom("marketplaceGroups")
      .select(["groupId", "name"])
      .where("marketplace", "=", "cardmarket")
      .orderBy("groupId")
      .execute();

    // Count staging rows per expansion
    const stagingCounts = await db
      .selectFrom("marketplaceStaging")
      .select((eb) => [
        "groupId" as const,
        eb.fn.count<number>("externalId").distinct().as("count"),
      ])
      .where("marketplace", "=", "cardmarket")
      .where("groupId", "is not", null)
      .groupBy("groupId")
      .execute();

    const countMap = new Map(stagingCounts.map((r) => [r.groupId, Number(r.count)]));

    // Count assigned (mapped) products per expansion
    const assignedCounts = await db
      .selectFrom("marketplaceSources")
      .select((eb) => ["groupId" as const, eb.fn.countAll<number>().as("count")])
      .where("marketplace", "=", "cardmarket")
      .where("groupId", "is not", null)
      .groupBy("groupId")
      .execute();

    const assignedMap = new Map(assignedCounts.map((r) => [r.groupId, Number(r.count)]));

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
      const db = c.get("db");
      const expansionId = Number(c.req.valid("param").id);
      const { name } = c.req.valid("json");

      await db
        .updateTable("marketplaceGroups")
        .set({ name, updatedAt: new Date() })
        .where("marketplace", "=", "cardmarket")
        .where("groupId", "=", expansionId)
        .execute();

      return c.body(null, 204);
    },
  )

  // ── TCGPlayer Groups ─────────────────────────────────────────────────────────

  .use("/admin/tcgplayer-groups", requireAdmin)

  .get("/admin/tcgplayer-groups", async (c) => {
    const db = c.get("db");
    const groups = await db
      .selectFrom("marketplaceGroups")
      .select(["groupId", "name", "abbreviation"])
      .where("marketplace", "=", "tcgplayer")
      .orderBy("name")
      .execute();

    // Count staging rows per groupId
    const stagingCounts = await db
      .selectFrom("marketplaceStaging")
      .select((eb) => [
        "groupId" as const,
        eb.fn.count<number>("externalId").distinct().as("count"),
      ])
      .where("marketplace", "=", "tcgplayer")
      .where("groupId", "is not", null)
      .groupBy("groupId")
      .execute();

    const countMap = new Map(stagingCounts.map((r) => [r.groupId, Number(r.count)]));

    // Count assigned (mapped) products per groupId
    const assignedCounts = await db
      .selectFrom("marketplaceSources")
      .select((eb) => ["groupId" as const, eb.fn.countAll<number>().as("count")])
      .where("marketplace", "=", "tcgplayer")
      .where("groupId", "is not", null)
      .groupBy("groupId")
      .execute();

    const assignedMap = new Map(assignedCounts.map((r) => [r.groupId, Number(r.count)]));

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

  .use("/admin/sets", requireAdmin)

  .get("/admin/sets", async (c) => {
    const db = c.get("db");
    const sets = await db.selectFrom("sets").selectAll().orderBy("sortOrder").execute();

    const cardCounts = await db
      .selectFrom("printings")
      .select((eb) => ["setId" as const, eb.fn.count<number>("cardId").distinct().as("cardCount")])
      .groupBy("setId")
      .execute();

    const printingCounts = await db
      .selectFrom("printings")
      .select((eb) => ["setId" as const, eb.fn.countAll<number>().as("printingCount")])
      .groupBy("setId")
      .execute();

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
      const db = c.get("db");
      const { id } = c.req.valid("param");
      const { name, printedTotal, releasedAt } = c.req.valid("json");

      await db
        .updateTable("sets")
        .set({
          name,
          printedTotal,
          releasedAt,
          updatedAt: new Date(),
        })
        .where("slug", "=", id)
        .execute();

      return c.body(null, 204);
    },
  )

  .post("/admin/sets", zValidator("json", createSetSchema), async (c) => {
    const db = c.get("db");
    const { id, name, printedTotal, releasedAt } = c.req.valid("json");

    const existing = await db
      .selectFrom("sets")
      .select("id")
      .where("slug", "=", id)
      .executeTakeFirst();

    if (existing) {
      throw new AppError(409, "CONFLICT", `Set with ID "${id}" already exists`);
    }

    const maxOrder = await db
      .selectFrom("sets")
      .select((eb) => eb.fn.coalesce(eb.fn.max("sortOrder"), eb.lit(0)).as("max"))
      .executeTakeFirstOrThrow();

    await db
      .insertInto("sets")
      .values({
        slug: id,
        name,
        printedTotal,
        releasedAt: releasedAt ?? null,
        sortOrder: maxOrder.max + 1,
      })
      .execute();

    return c.body(null, 204);
  })

  // ── Set reorder ───────────────────────────────────────────────────────────────

  .use("/admin/sets/reorder", requireAdmin)

  .put("/admin/sets/reorder", zValidator("json", reorderSetsSchema), async (c) => {
    const db = c.get("db");
    const { ids } = c.req.valid("json");

    await db.transaction().execute(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .updateTable("sets")
          .set({ sortOrder: i + 1, updatedAt: new Date() })
          .where("slug", "=", ids[i])
          .execute();
      }
    });

    return c.body(null, 204);
  });
