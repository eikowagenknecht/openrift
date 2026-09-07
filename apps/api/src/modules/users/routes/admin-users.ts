import { adminUsersContract } from "@openrift/shared/contracts/admin/users";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";

const os = implement(adminUsersContract).$context<ApiContext>().use(requireAuthedUser);

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
