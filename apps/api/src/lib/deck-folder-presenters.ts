import type { DeckFolderResponse } from "@openrift/shared/types/api/deck";

import type { DeckFolderWithCount } from "../repositories/deck-folders.js";

export function toDeckFolder(row: DeckFolderWithCount): DeckFolderResponse {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    deckCount: row.deckCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
