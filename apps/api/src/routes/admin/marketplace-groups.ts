import { zValidator } from "@hono/zod-validator";
import type { MarketplaceGroupResponse } from "@openrift/shared";
import { Hono } from "hono";
import { z } from "zod/v4";

import { AppError } from "../../errors.js";
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

  .get("/marketplace-groups", async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");

    const [groups, stagingCounts, assignedCounts] = await Promise.all([
      mktAdmin.listAllGroups(),
      mktAdmin.stagingCountsByMarketplaceGroup(),
      mktAdmin.assignedCountsByMarketplaceGroup(),
    ]);

    const stagingMap = new Map(
      stagingCounts.map((r) => [`${r.marketplace}:${r.groupId}`, r.count]),
    );

    const assignedMap = new Map(
      assignedCounts.map((r) => [`${r.marketplace}:${r.groupId}`, r.count]),
    );

    return c.json({
      groups: groups.map((g): MarketplaceGroupResponse => {
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
    "/marketplace-groups/:marketplace/:id",
    zValidator("param", marketplaceGroupParamSchema),
    zValidator("json", updateGroupSchema),
    async (c) => {
      const { marketplaceAdmin: mktAdmin } = c.get("repos");
      const { marketplace, id: groupId } = c.req.valid("param");
      const { name } = c.req.valid("json");

      const updated = await mktAdmin.updateGroupName(marketplace, groupId, name);
      if (!updated) {
        throw new AppError(
          404,
          "NOT_FOUND",
          `Marketplace group ${marketplace}/${groupId} not found`,
        );
      }

      return c.body(null, 204);
    },
  );
