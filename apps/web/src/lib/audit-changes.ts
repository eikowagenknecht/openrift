/** One field-level change line derived from an audit event's payloads. */
export interface AuditChange {
  field: string;
  from: string | null;
  to: string | null;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value) ?? "";
}

/**
 * Flattens an audit event's old/new jsonb payloads into per-field change
 * lines over the union of both key sets. A key present on only one side
 * renders with `null` on the other (created / removed value).
 *
 * @returns One entry per field, in first-seen key order.
 */
export function formatAuditChanges(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): AuditChange[] {
  const keys = [...new Set([...Object.keys(oldValues ?? {}), ...Object.keys(newValues ?? {})])];
  return keys.map((field) => ({
    field,
    from: oldValues && field in oldValues ? formatValue(oldValues[field]) : null,
    to: newValues && field in newValues ? formatValue(newValues[field]) : null,
  }));
}
