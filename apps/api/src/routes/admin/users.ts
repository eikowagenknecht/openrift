import { adminUsersContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminUsersContract).$context<ApiContext>().use(requireUser);

/**
 * Admin users list. `createdAt` / `lastActiveAt` are mapped from `Date` to ISO
 * strings to satisfy the contract output schema.
 */
export const adminUsersRouter = {
  list: os.list.handler(async ({ context }) => {
    const { users: usersRepo } = context.repos;
    const rows = await usersRepo.listWithCounts();

    return {
      users: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        image: r.image,
        isAdmin: r.isAdmin,
        cardCount: r.cardCount,
        deckCount: r.deckCount,
        collectionCount: r.collectionCount,
        listCount: r.listCount,
        createdAt: r.createdAt.toISOString(),
        lastActiveAt: r.lastActiveAt ? r.lastActiveAt.toISOString() : null,
      })),
    };
  }),
};
