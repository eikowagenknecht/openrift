import type { AdminEventRow } from "../repositories/admin-events.js";

/** The stored audit row with `createdAt` rendered as ISO 8601. */
export type AuditEventView = Omit<AdminEventRow, "createdAt"> & { createdAt: string };

export function toAuditEvent(row: AdminEventRow): AuditEventView {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
