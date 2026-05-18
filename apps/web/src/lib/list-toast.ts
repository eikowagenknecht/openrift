import type { ListBulkAddResponse } from "@openrift/shared";

/**
 * Renders the toast message for a drag-to-list result. New entries say
 * "Added"; re-drops that bump an existing entry's quantity say "Bumped";
 * non-owned copies show up as a parenthetical tail.
 * @returns The message to feed into `toast.success` / `toast.info`.
 */
export function describeListAdd(result: ListBulkAddResponse, listName: string): string {
  const tail = result.skipped > 0 ? ` (${result.skipped} not owned)` : "";
  if (result.added === 0 && result.updated === 0) {
    return `Nothing added to "${listName}"${tail}`;
  }
  if (result.added === 0) {
    return `Bumped quantity in "${listName}"${tail}`;
  }
  if (result.updated === 0) {
    return `Added ${result.added} to "${listName}"${tail}`;
  }
  return `Added ${result.added} to "${listName}" (${result.updated} bumped)${tail}`;
}
