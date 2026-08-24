import type { AdminEventRow } from "../repositories/admin-events.js";

/**
 * One audit event as the admin API returns it: the stored row with its
 * timestamp rendered as ISO 8601. The payload columns pass through unchanged —
 * they round-trip through jsonb and the contract validates them as plain JSON.
 */
export type AuditEventView = Omit<AdminEventRow, "createdAt"> & { createdAt: string };

/**
 * Maps one audit row to its response shape.
 * @param row The joined audit row from the admin-events repository.
 * @returns The row with an ISO 8601 `createdAt`.
 */
export function toAuditEvent(row: AdminEventRow): AuditEventView {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
