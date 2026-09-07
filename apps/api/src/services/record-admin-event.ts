import { createLogger } from "@openrift/shared/logger";

import type { Repos } from "../deps.js";
import type { AdminEventInsert } from "../repositories/admin-events.js";

const log = createLogger("admin-audit");

/**
 * Best-effort: a failed write only logs a warning. The audit log must never
 * break or roll back the mutation it describes.
 */
export async function recordAdminEvent(
  repos: Pick<Repos, "adminEvents">,
  actorUserId: string,
  event: Omit<AdminEventInsert, "actorUserId">,
): Promise<void> {
  try {
    await repos.adminEvents.insert({ actorUserId, ...event });
  } catch (error) {
    log.warn({ action: event.action, error }, "audit event write failed");
  }
}
