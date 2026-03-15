import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const marketplaceGroupParamSchema = z.object({
  marketplace: z.string().min(1),
  id: z.string().min(1),
});

const updateGroupSchema = z.object({
  name: z.string().nullable(),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const marketplaceGroupsRoute = new Hono<{ Variables: Variables }>()

  .use("/admin/marketplace-groups", requireAdmin)
  .use("/admin/marketplace-groups/*", requireAdmin)

  .get("/admin/marketplace-groups", async (c) => {
    const groups = await db
      .selectFrom("marketplace_groups")
      .select(["marketplace", "group_id", "name", "abbreviation"])
      .orderBy("marketplace")
      .orderBy("name")
      .execute();

    const stagingCounts = await db
      .selectFrom("marketplace_staging")
      .select((eb) => [
        "marketplace" as const,
        "group_id" as const,
        eb.fn.count<number>("external_id").distinct().as("count"),
      ])
      .where("group_id", "is not", null)
      .groupBy(["marketplace", "group_id"])
      .execute();

    const stagingMap = new Map(
      stagingCounts.map((r) => [`${r.marketplace}:${r.group_id}`, Number(r.count)]),
    );

    const assignedCounts = await db
      .selectFrom("marketplace_sources")
      .select((eb) => [
        "marketplace" as const,
        "group_id" as const,
        eb.fn.countAll<number>().as("count"),
      ])
      .where("group_id", "is not", null)
      .groupBy(["marketplace", "group_id"])
      .execute();

    const assignedMap = new Map(
      assignedCounts.map((r) => [`${r.marketplace}:${r.group_id}`, Number(r.count)]),
    );

    return c.json({
      groups: groups.map((g) => {
        const key = `${g.marketplace}:${g.group_id}`;
        return {
          marketplace: g.marketplace,
          groupId: g.group_id,
          name: g.name,
          abbreviation: g.abbreviation,
          stagedCount: stagingMap.get(key) ?? 0,
          assignedCount: assignedMap.get(key) ?? 0,
        };
      }),
    });
  })

  .patch(
    "/admin/marketplace-groups/:marketplace/:id",
    zValidator("param", marketplaceGroupParamSchema),
    zValidator("json", updateGroupSchema),
    async (c) => {
      const { marketplace, id } = c.req.valid("param");
      const groupId = Number(id);
      const { name } = c.req.valid("json");

      await db
        .updateTable("marketplace_groups")
        .set({ name, updated_at: new Date() })
        .where("marketplace", "=", marketplace)
        .where("group_id", "=", groupId)
        .execute();

      return c.json({ ok: true });
    },
  );
