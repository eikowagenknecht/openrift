import type { ListBulkAddResponse } from "@openrift/shared/types/api/list";

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
