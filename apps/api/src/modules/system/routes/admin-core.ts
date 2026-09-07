import { adminCoreContract } from "@openrift/shared/contracts/admin/core";
import { implement } from "@orpc/server";

import { getAdminAccess } from "../../../middleware/require-admin.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";

const os = implement(adminCoreContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * `me` hits the `requireAdmin` gate's 30s cache, so calling it is effectively free.
 */
export const adminCoreRouter = {
  me: os.me.handler(({ context }) => getAdminAccess(context.repos, context.userId)),
};
