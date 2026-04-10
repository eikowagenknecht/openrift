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
                id: z.string().openapi({ example: "V07rIX7hwiXgRxHwxo1HtV1ybv8Z7iyK" }),
                email: z.string().openapi({ example: "eiko@example.com" }),
                name: z.string().nullable().openapi({ example: "Eiko Wagenknecht" }),
                image: z.string().nullable().openapi({ example: "https://example.com/avatar.jpg" }),
                isAdmin: z.boolean().openapi({ example: true }),
                cardCount: z.number().openapi({ example: 342 }),
                deckCount: z.number().openapi({ example: 5 }),
                collectionCount: z.number().openapi({ example: 3 }),
                createdAt: z.string().openapi({ example: "2026-03-11T18:04:22.059Z" }),
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
