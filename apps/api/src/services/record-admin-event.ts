import { createLogger } from "@openrift/shared/logger";

import type { Repos } from "../deps.js";
import type { AdminEventInsert } from "../repositories/admin-events.js";

const log = createLogger("admin-audit");

/**
 * Record one admin audit event (migration 201). Best-effort: called after the
 * mutation has committed, and a failed write only logs a warning — the audit
 * log must never break or roll back the mutation it describes.
 *
 * @returns Resolves when the event has been recorded (or the failure logged).
 */
export async function recordAdminEvent(
  repos: Pick<Repos, "adminEvents">,
  actorUserId: string,
  event: Omit<AdminEventInsert, "actorUserId">,
): Promise<void> {
  try {
    await repos.adminEvents.insert({ actorUserId, ...event });
  } catch (error) {
    // Non-fatal, but worth surfacing: an invisible audit failure is worse
    // than a noisy one.
    log.warn({ action: event.action, error }, "audit event write failed");
  }
}
