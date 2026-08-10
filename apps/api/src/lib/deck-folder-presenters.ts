import type { DeckFolderResponse } from "@openrift/shared";

import type { DeckFolderWithCount } from "../repositories/deck-folders.js";

/**
 * Maps a deck-folder row (with its deck count) to the API response shape.
 * @returns The folder as a `DeckFolderResponse`.
 */
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
