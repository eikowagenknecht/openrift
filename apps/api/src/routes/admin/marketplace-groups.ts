import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { MarketplaceGroupResponse } from "@openrift/shared";
import { marketplaceGroupParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { marketplaceGroupKindEnum, updateGroupSchema } from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const listGroups = createRoute({
  method: "get",
  path: "/marketplace-groups",
  tags: ["Admin - Marketplace Groups"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            groups: z.array(
              z.object({
                marketplace: z.string().openapi({ example: "cardmarket" }),
                groupId: z.number().openapi({ example: 6286 }),
                name: z.string().nullable().openapi({ example: "Origins" }),
                abbreviation: z.string().nullable().openapi({ example: "OGN" }),
                groupKind: marketplaceGroupKindEnum.openapi({ example: "basic" }),
                setId: z
                  .string()
                  .uuid()
                  .nullable()
                  .openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
                stagedCount: z.number().openapi({ example: 0 }),
                assignedCount: z.number().openapi({ example: 312 }),
              }),
            ),
          }),
        },
      },
      description: "List marketplace groups",
    },
  },
});

const updateGroup = createRoute({
  method: "patch",
  path: "/marketplace-groups/{marketplace}/{id}",
  tags: ["Admin - Marketplace Groups"],
  request: {
    params: marketplaceGroupParamSchema,
    body: { content: { "application/json": { schema: updateGroupSchema } } },
  },
  responses: {
    204: { description: "Group updated" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const marketplaceGroupsRoute = new OpenAPIHono<{ Variables: Variables }>()

  .openapi(listGroups, async (c) => {
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
          groupKind: g.groupKind,
          setId: g.setId,
          stagedCount: stagingMap.get(key) ?? 0,
          assignedCount: assignedMap.get(key) ?? 0,
        };
      }),
    });
  })

  .openapi(updateGroup, async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { marketplace, id: groupId } = c.req.valid("param");
    const patch = c.req.valid("json");

    const updated = await mktAdmin.updateGroup(marketplace, groupId, patch);
    if (!updated) {
      throw new AppError(
        404,
        ERROR_CODES.NOT_FOUND,
        `Marketplace group ${marketplace}/${groupId} not found`,
      );
    }

    return c.body(null, 204);
  });
