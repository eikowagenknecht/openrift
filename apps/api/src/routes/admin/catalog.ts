import { Hono } from "hono";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";

export const catalogRoute = new Hono<{ Variables: Variables }>();

// ── Cardmarket Expansions ────────────────────────────────────────────────────

catalogRoute.use("/admin/cardmarket-groups", requireAdmin);

catalogRoute.get("/admin/cardmarket-groups", async (c) => {
  const expansions = await db
    .selectFrom("marketplace_groups")
    .select(["group_id", "name"])
    .where("marketplace", "=", "cardmarket")
    .orderBy("group_id")
    .execute();

  // Count staging rows per expansion
  const stagingCounts = await db
    .selectFrom("marketplace_staging")
    .select((eb) => [
      "group_id" as const,
      eb.fn.count<number>("external_id").distinct().as("count"),
    ])
    .where("marketplace", "=", "cardmarket")
    .where("group_id", "is not", null)
    .groupBy("group_id")
    .execute();

  const countMap = new Map(stagingCounts.map((r) => [r.group_id, Number(r.count)]));

  // Count assigned (mapped) products per expansion
  const assignedCounts = await db
    .selectFrom("marketplace_sources")
    .select((eb) => ["group_id" as const, eb.fn.countAll<number>().as("count")])
    .where("marketplace", "=", "cardmarket")
    .where("group_id", "is not", null)
    .groupBy("group_id")
    .execute();

  const assignedMap = new Map(assignedCounts.map((r) => [r.group_id, Number(r.count)]));

  return c.json({
    expansions: expansions.map((e) => ({
      expansionId: e.group_id,
      name: e.name,
      stagedCount: countMap.get(e.group_id) ?? 0,
      assignedCount: assignedMap.get(e.group_id) ?? 0,
    })),
  });
});

const updateExpansionSchema = z.object({
  expansionId: z.number(),
  name: z.string().nullable(),
});

catalogRoute.put("/admin/cardmarket-groups", async (c) => {
  const { expansionId, name } = updateExpansionSchema.parse(await c.req.json());

  await db
    .updateTable("marketplace_groups")
    .set({ name, updated_at: new Date() })
    .where("marketplace", "=", "cardmarket")
    .where("group_id", "=", expansionId)
    .execute();

  return c.json({ ok: true });
});

// ── TCGPlayer Groups ─────────────────────────────────────────────────────────

catalogRoute.use("/admin/tcgplayer-groups", requireAdmin);

catalogRoute.get("/admin/tcgplayer-groups", async (c) => {
  const groups = await db
    .selectFrom("marketplace_groups")
    .select(["group_id", "name", "abbreviation"])
    .where("marketplace", "=", "tcgplayer")
    .orderBy("name")
    .execute();

  // Count staging rows per group_id
  const stagingCounts = await db
    .selectFrom("marketplace_staging")
    .select((eb) => [
      "group_id" as const,
      eb.fn.count<number>("external_id").distinct().as("count"),
    ])
    .where("marketplace", "=", "tcgplayer")
    .where("group_id", "is not", null)
    .groupBy("group_id")
    .execute();

  const countMap = new Map(stagingCounts.map((r) => [r.group_id, Number(r.count)]));

  // Count assigned (mapped) products per group_id
  const assignedCounts = await db
    .selectFrom("marketplace_sources")
    .select((eb) => ["group_id" as const, eb.fn.countAll<number>().as("count")])
    .where("marketplace", "=", "tcgplayer")
    .where("group_id", "is not", null)
    .groupBy("group_id")
    .execute();

  const assignedMap = new Map(assignedCounts.map((r) => [r.group_id, Number(r.count)]));

  return c.json({
    groups: groups.map((g) => ({
      groupId: g.group_id,
      name: g.name,
      abbreviation: g.abbreviation,
      stagedCount: countMap.get(g.group_id) ?? 0,
      assignedCount: assignedMap.get(g.group_id) ?? 0,
    })),
  });
});

// ── Sets CRUD ─────────────────────────────────────────────────────────────────

catalogRoute.use("/admin/sets", requireAdmin);

catalogRoute.get("/admin/sets", async (c) => {
  const sets = await db.selectFrom("sets").selectAll().orderBy("sort_order").execute();

  const cardCounts = await db
    .selectFrom("printings")
    .select((eb) => ["set_id" as const, eb.fn.count<number>("card_id").distinct().as("card_count")])
    .groupBy("set_id")
    .execute();

  const printingCounts = await db
    .selectFrom("printings")
    .select((eb) => ["set_id" as const, eb.fn.countAll<number>().as("printing_count")])
    .groupBy("set_id")
    .execute();

  const cardCountMap = new Map(cardCounts.map((r) => [r.set_id, Number(r.card_count)]));
  const printingCountMap = new Map(printingCounts.map((r) => [r.set_id, Number(r.printing_count)]));

  return c.json({
    sets: sets.map((s) => ({
      id: s.id,
      name: s.name,
      printedTotal: s.printed_total,
      sortOrder: s.sort_order,
      releasedAt: s.released_at ?? null,
      cardCount: cardCountMap.get(s.id) ?? 0,
      printingCount: printingCountMap.get(s.id) ?? 0,
    })),
  });
});

const updateSetSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  printedTotal: z.number().int().min(0),
  releasedAt: z.string().nullable(),
});

catalogRoute.put("/admin/sets", async (c) => {
  const { id, name, printedTotal, releasedAt } = updateSetSchema.parse(await c.req.json());

  await db
    .updateTable("sets")
    .set({ name, printed_total: printedTotal, released_at: releasedAt, updated_at: new Date() })
    .where("id", "=", id)
    .execute();

  return c.json({ ok: true });
});

const createSetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  printedTotal: z.number().int().min(0),
  releasedAt: z.string().nullable().optional(),
});

catalogRoute.post("/admin/sets", async (c) => {
  const { id, name, printedTotal, releasedAt } = createSetSchema.parse(await c.req.json());

  const existing = await db.selectFrom("sets").select("id").where("id", "=", id).executeTakeFirst();

  if (existing) {
    throw new AppError(409, "CONFLICT", `Set with ID "${id}" already exists`);
  }

  const maxOrder = await db
    .selectFrom("sets")
    .select((eb) => eb.fn.coalesce(eb.fn.max("sort_order"), eb.lit(0)).as("max"))
    .executeTakeFirstOrThrow();

  await db
    .insertInto("sets")
    .values({
      id,
      name,
      printed_total: printedTotal,
      released_at: releasedAt ?? null,
      sort_order: maxOrder.max + 1,
    })
    .execute();

  return c.json({ ok: true });
});

// ── Set reorder ───────────────────────────────────────────────────────────────

catalogRoute.use("/admin/sets/reorder", requireAdmin);

const reorderSetsSchema = z.object({
  ids: z.array(z.string()).min(1),
});

catalogRoute.put("/admin/sets/reorder", async (c) => {
  const { ids } = reorderSetsSchema.parse(await c.req.json());

  await db.transaction().execute(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .updateTable("sets")
        .set({ sort_order: i + 1, updated_at: new Date() })
        .where("id", "=", ids[i])
        .execute();
    }
  });

  return c.json({ ok: true });
});
