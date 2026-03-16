import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import { requireAdmin } from "../../middleware/require-admin.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const marketplaceGroupParamSchema = z.object({
  marketplace: z.string().min(1),
  id: z.coerce.number().int(),
});

const updateGroupSchema = z.object({
  name: z.string().nullable(),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const marketplaceGroupsRoute = new Hono<{ Variables: Variables }>()

  .use("/admin/marketplace-groups", requireAdmin)
  .use("/admin/marketplace-groups/*", requireAdmin)

  .get("/admin/marketplace-groups", async (c) => {
    const db = c.get("db");
    const groups = await db
      .selectFrom("marketplaceGroups")
      .select(["marketplace", "groupId", "name", "abbreviation"])
      .orderBy("marketplace")
      .orderBy("name")
      .execute();

    const stagingCounts = await db
      .selectFrom("marketplaceStaging")
      .select((eb) => [
        "marketplace" as const,
        "groupId" as const,
        eb.fn.count<number>("externalId").distinct().as("count"),
      ])
      .where("groupId", "is not", null)
      .groupBy(["marketplace", "groupId"])
      .execute();

    const stagingMap = new Map(
      stagingCounts.map((r) => [`${r.marketplace}:${r.groupId}`, Number(r.count)]),
    );

    const assignedCounts = await db
      .selectFrom("marketplaceSources")
      .select((eb) => [
        "marketplace" as const,
        "groupId" as const,
        eb.fn.countAll<number>().as("count"),
      ])
      .where("groupId", "is not", null)
      .groupBy(["marketplace", "groupId"])
      .execute();

    const assignedMap = new Map(
      assignedCounts.map((r) => [`${r.marketplace}:${r.groupId}`, Number(r.count)]),
    );

    return c.json({
      groups: groups.map((g) => {
        const key = `${g.marketplace}:${g.groupId}`;
        return {
          marketplace: g.marketplace,
          groupId: g.groupId,
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
      const db = c.get("db");
      const { marketplace, id: groupId } = c.req.valid("param");
      const { name } = c.req.valid("json");

      await db
        .updateTable("marketplaceGroups")
        .set({ name, updatedAt: new Date() })
        .where("marketplace", "=", marketplace)
        .where("groupId", "=", groupId)
        .execute();

      return c.json({ ok: true });
    },
  );
