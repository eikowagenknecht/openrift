import type { ActivityAction, CardType } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";

import type { CollectionEventsTable, Database, PrintingsTable } from "../db/index.js";
import { imageUrl, superTypesArray } from "./query-helpers.js";

/** Collection event row with printing, card, and image details. */
type CollectionEventRow = Pick<
  Selectable<CollectionEventsTable>,
  | "id"
  | "action"
  | "copyId"
  | "printingId"
  | "fromCollectionId"
  | "fromCollectionName"
  | "toCollectionId"
  | "toCollectionName"
  | "createdAt"
> &
  Pick<Selectable<PrintingsTable>, "shortCode" | "rarity"> & {
    imageUrl: string | null;
    cardName: string;
    cardType: CardType;
    cardSuperTypes: string[];
  };

/**
 * Queries for collection event history.
 *
 * @returns An object with collection event query methods bound to the given `db`.
 */
export function collectionEventsRepo(db: Kysely<Database>) {
  return {
    /**
     * Cursor-paginated list of events with card details (newest first).
     * Fetches `limit + 1` rows to detect `hasMore`.
     * @returns Events enriched with printing, card, and image data.
     */
    listForUser(userId: string, limit: number, cursor?: string): Promise<CollectionEventRow[]> {
      let query = db
        .selectFrom("collectionEvents as ce")
        .innerJoin("printings as p", "p.id", "ce.printingId")
        .innerJoin("cards as card", "card.id", "p.cardId")
        .leftJoin("printingImages as pi", (join) =>
          join
            .onRef("pi.printingId", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.isActive", "=", true),
        )
        .select([
          "ce.id",
          "ce.action",
          "ce.copyId",
          "ce.printingId",
          "ce.fromCollectionId",
          "ce.fromCollectionName",
          "ce.toCollectionId",
          "ce.toCollectionName",
          "ce.createdAt",
          imageUrl("pi").as("imageUrl"),
          "p.shortCode",
          "p.rarity",
          "card.name as cardName",
          "card.type as cardType",
          superTypesArray("card.id").as("cardSuperTypes"),
        ])
        .where("ce.userId", "=", userId)
        .orderBy("ce.createdAt", "desc")
        .orderBy("ce.id", "desc")
        .limit(limit + 1);
      if (cursor) {
        query = query.where("ce.createdAt", "<", new Date(cursor));
      }
      return query.execute();
    },

    /** Batch-insert collection events. No-op for empty array. */
    async insert(
      items: {
        userId: string;
        action: ActivityAction;
        printingId: string;
        copyId: string | null;
        fromCollectionId: string | null;
        fromCollectionName: string | null;
        toCollectionId: string | null;
        toCollectionName: string | null;
      }[],
    ): Promise<void> {
      if (items.length === 0) {
        return;
      }
      await db.insertInto("collectionEvents").values(items).execute();
    },
  };
}
