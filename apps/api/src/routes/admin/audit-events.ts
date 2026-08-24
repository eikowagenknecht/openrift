import { adminAuditEventsContract } from "@openrift/shared/contracts/admin/audit-events";
import { implement } from "@orpc/server";

import { toAuditEvent } from "../../lib/audit-event-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { keysetPage } from "../../repositories/query-helpers.js";

const os = implement(adminAuditEventsContract).$context<ApiContext>().use(requireAuthedUser);

const DEFAULT_LIMIT = 50;

/**
 * Admin audit log reads (full admins only — no per-section grant maps this
 * surface, so the `requireAdmin` gate never lets grant holders through).
 */
export const adminAuditEventsRouter = {
  list: os.list.handler(async ({ input, context }) => {
    const { adminEvents } = context.repos;
    const limit = input.limit ?? DEFAULT_LIMIT;

    const rows = await adminEvents.list(
      { actorUserId: input.actorUserId, action: input.action, search: input.search },
      limit,
      input.cursor,
    );

    // The repo fetches limit + 1 rows to probe for another page.
    return keysetPage(rows, limit, toAuditEvent);
  }),

  actors: os.actors.handler(async ({ context }) => {
    const actors = await context.repos.adminEvents.listActors();
    return { actors };
  }),

  actions: os.actions.handler(async ({ context }) => {
    const actions = await context.repos.adminEvents.listActions();
    return { actions };
  }),
};
