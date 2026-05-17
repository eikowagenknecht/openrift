interface StaticCountTableActionsProps {
  count: number;
}

/**
 * Read-only `×N` actions cell for tables that surface a precomputed count and
 * have no inventory mutations (shared-collection view, /promos sections).
 * Renders nothing when count is zero.
 *
 * @returns The static count content (no wrapper — CardTableRow renders that).
 */
export function StaticCountTableActions({ count }: StaticCountTableActionsProps) {
  return count > 0 ? `×${count}` : "";
}
