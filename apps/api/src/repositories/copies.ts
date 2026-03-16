import type { CardType } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";

import { imageUrl, selectCopyWithCard } from "../db-helpers.js";
import type { CopiesTable, Database, PrintingsTable } from "../db/index.js";

/** Denormalized copy row with printing, card, and image details. */
type CopyRow = Pick<
  Selectable<CopiesTable>,
  "id" | "printingId" | "collectionId" | "sourceId" | "createdAt" | "updatedAt"
> &
  Pick<
    Selectable<PrintingsTable>,
    | "cardId"
    | "setId"
    | "collectorNumber"
    | "rarity"
    | "artVariant"
    | "isSigned"
    | "finish"
    | "artist"
  > & {
    imageUrl: string | null;
    cardName: string;
    cardType: CardType;
  };

const COPY_SELECT = [
  "cp.id",
  "cp.printingId",
  "cp.collectionId",
  "cp.sourceId",
  "cp.createdAt",
  "cp.updatedAt",
  "p.cardId",
  "p.setId",
  "p.collectorNumber",
  "p.rarity",
  "p.artVariant",
  "p.isSigned",
  "p.finish",
  imageUrl("pi").as("imageUrl"),
  "p.artist",
  "c.name as cardName",
  "c.type as cardType",
] as const;

/**
 * Read-only queries for user copy data.
 *
 * @returns An object with copy query methods bound to the given `db`.
 */
export function copiesRepo(db: Kysely<Database>) {
  return {
    /** @returns All copies for a user, ordered by card name then collector number. */
    listForUser(userId: string): Promise<CopyRow[]> {
      return selectCopyWithCard(db)
        .select([...COPY_SELECT])
        .where("cp.userId", "=", userId)
        .orderBy("c.name")
        .orderBy("p.collectorNumber")
        .execute();
    },

    /** @returns A single copy by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<CopyRow | undefined> {
      return selectCopyWithCard(db)
        .select([...COPY_SELECT])
        .where("cp.id", "=", id)
        .where("cp.userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Owned count per printing for a user. */
    countByPrintingForUser(userId: string): Promise<{ printingId: string; count: number }[]> {
      return db
        .selectFrom("copies")
        .select(["printingId", db.fn.count<number>("id").as("count")])
        .where("userId", "=", userId)
        .groupBy("printingId")
        .execute();
    },

    /** @returns All copies in a specific collection, ordered by card name then collector number. */
    listForCollection(collectionId: string): Promise<CopyRow[]> {
      return selectCopyWithCard(db)
        .select([...COPY_SELECT])
        .where("cp.collectionId", "=", collectionId)
        .orderBy("c.name")
        .orderBy("p.collectorNumber")
        .execute();
    },
  };
}
