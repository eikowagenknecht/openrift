import type { ActivityAction, CardType } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { CollectionEventsTable, Database, PrintingsTable } from "../db/index.js";
import { imageUrl } from "./query-helpers.js";

const CURSOR_SEPARATOR = "_";

/**
 * Builds an opaque keyset cursor from a timestamp and id.
 * @returns A cursor string encoding both values.
 */
export function buildEventsCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}${CURSOR_SEPARATOR}${id}`;
}

function parseCursor(cursor: string): { time: Date; id: string | null } {
  const separatorIndex = cursor.indexOf(CURSOR_SEPARATOR);
  if (separatorIndex === -1) {
    return { time: new Date(cursor), id: null };
  }
  return {
    time: new Date(cursor.slice(0, separatorIndex)),
    id: cursor.slice(separatorIndex + 1),
  };
}

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
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "card.id")
        .leftJoin("printingImages as pi", (join) =>
          join
            .onRef("pi.printingId", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.isActive", "=", true),
        )
        .leftJoin("imageFiles as ci", "ci.id", "pi.imageFileId")
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
          imageUrl("ci").as("imageUrl"),
          "p.shortCode",
          "p.rarity",
          "card.name as cardName",
          "card.type as cardType",
          "mca.superTypes as cardSuperTypes",
        ])
        .where("ce.userId", "=", userId)
        .orderBy("ce.createdAt", "desc")
        .orderBy("ce.id", "desc")
        .limit(limit + 1);
      if (cursor) {
        const { time, id } = parseCursor(cursor);
        const tsMs = sql<Date>`date_trunc('milliseconds', ${sql.ref("ce.createdAt")})`;
        query = id
          ? query.where((eb) =>
              eb.or([eb(tsMs, "<", time), eb.and([eb(tsMs, "=", time), eb("ce.id", "<", id)])]),
            )
          : query.where(tsMs, "<", time);
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

    // The FK on (from|to)_collection_id uses ON DELETE SET NULL, but the
    // chk_collection_events_collection_presence check forbids NULLs on
    // 'removed' / 'moved' rows. So we have to purge any event that references
    // the collection before deleting the collection itself, otherwise the
    // delete would violate the check constraint.
    async deleteForCollection(collectionId: string, userId: string): Promise<void> {
      await db
        .deleteFrom("collectionEvents")
        .where("userId", "=", userId)
        .where((eb) =>
          eb.or([
            eb("fromCollectionId", "=", collectionId),
            eb("toCollectionId", "=", collectionId),
          ]),
        )
        .execute();
    },
  };
}
