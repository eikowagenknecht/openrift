import type { Kysely, Selectable } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { ListsTable } from "../../../db/tables/lists.js";
import {
  findByShareToken,
  selectShareState,
  updateShareRow,
} from "../../../repositories/query-helpers.js";

export function listsSharingRepo(db: Kysely<Database>) {
  return {
    /**
     * `undefined` only when the list isn't owned by the user — callers must
     * distinguish "not owned" (→ 404) from "owned but unshared" (→ token null).
     */
    getShareState(
      id: string,
      userId: string,
    ): Promise<{ shareToken: string | null; isPublic: boolean } | undefined> {
      return selectShareState(db, "lists", id, userId);
    },

    setShareToken(
      id: string,
      userId: string,
      shareToken: string | null,
      isPublic: boolean,
    ): Promise<Selectable<ListsTable> | undefined> {
      return updateShareRow(db, "lists", id, userId, shareToken, isPublic);
    },

    async findByShareToken(
      shareToken: string,
    ): Promise<
      { list: Selectable<ListsTable>; ownerName: string | null; ownerEmail: string } | undefined
    > {
      const found = await findByShareToken(db, "lists", shareToken);
      if (!found) {
        return undefined;
      }
      return { list: found.row, ownerName: found.ownerName, ownerEmail: found.ownerEmail };
    },
  };
}
