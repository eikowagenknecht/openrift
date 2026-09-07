import { isAdminSectionSlug } from "@openrift/shared/admin-sections";
import { adminGrantsContract } from "@openrift/shared/contracts/admin/grants";
import { implement, ORPCError } from "@orpc/server";

import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminGrantsContract).$context<ApiContext>().use(requireAuthedUser);

// `list` filters out grants whose section slug isn't in the shared registry,
// matching what the requireAdmin gate authorizes.
export const adminGrantsRouter = {
  list: os.list.handler(async ({ context }) => {
    const rows = await context.repos.adminGrants.listAllWithUsers();
    return {
      grants: rows.flatMap((r) =>
        isAdminSectionSlug(r.section)
          ? [
              {
                userId: r.userId,
                userName: r.userName,
                userEmail: r.userEmail,
                section: r.section,
              },
            ]
          : [],
      ),
    };
  }),

  add: os.add.handler(async ({ context, input }) => {
    if (!(await context.repos.users.existsById(input.id))) {
      throw new ORPCError("NOT_FOUND", { message: "User not found" });
    }
    await context.repos.adminGrants.add(input.id, input.section);
  }),

  remove: os.remove.handler(async ({ context, input }) => {
    const result = await context.repos.adminGrants.remove(input.id, input.section);
    if (result.numDeletedRows === 0n) {
      throw new ORPCError("NOT_FOUND", { message: "Grant not found for this user and section" });
    }
  }),
};
