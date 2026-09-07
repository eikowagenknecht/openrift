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

/** A key present on only one side renders with `null` on the other. */
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
