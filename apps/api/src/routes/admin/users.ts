import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { AdminUserResponse } from "@openrift/shared";
import { z } from "zod";

import type { Variables } from "../../types.js";

// ── Route definitions ───────────────────────────────────────────────────────

const listUsers = createRoute({
  method: "get",
  path: "/users",
  tags: ["Admin - Users"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            users: z.array(
              z.object({
                id: z.string(),
                email: z.string(),
                name: z.string().nullable(),
                image: z.string().nullable(),
                isAdmin: z.boolean(),
                cardCount: z.number(),
                deckCount: z.number(),
                collectionCount: z.number(),
                createdAt: z.string(),
              }),
            ),
          }),
        },
      },
      description: "List all users with aggregate counts",
    },
  },
});

// ── Router ──────────────────────────────────────────────────────────────────

export const adminUsersRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  listUsers,
  async (c) => {
    const { users: usersRepo } = c.get("repos");
    const rows = await usersRepo.listWithCounts();

    return c.json({
      users: rows.map(
        (r): AdminUserResponse => ({
          id: r.id,
          email: r.email,
          name: r.name,
          image: r.image,
          isAdmin: r.isAdmin,
          cardCount: r.cardCount,
          deckCount: r.deckCount,
          collectionCount: r.collectionCount,
          createdAt: r.createdAt.toISOString(),
        }),
      ),
    });
  },
);
