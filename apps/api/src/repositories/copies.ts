import type { CardType } from "@openrift/shared/types";
import type { Insertable, Kysely, Selectable } from "kysely";

import type { CopiesTable, Database, PrintingsTable } from "../db/index.js";
import { imageUrl, selectCopyWithCard } from "./query-helpers.js";

/** Denormalized copy row with printing, card, and image details. */
type CopyRow = Pick<
  Selectable<CopiesTable>,
  "id" | "printingId" | "collectionId" | "acquisitionSourceId" | "createdAt" | "updatedAt"
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
  "cp.acquisitionSourceId",
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

    /** @returns Multiple copies by IDs scoped to a user, ordered by card name then collector number. */
    listByIdsForUser(ids: string[], userId: string): Promise<CopyRow[]> {
      return selectCopyWithCard(db)
        .select([...COPY_SELECT])
        .where("cp.id", "in", ids)
        .where("cp.userId", "=", userId)
        .orderBy("c.name")
        .orderBy("p.collectorNumber")
        .execute();
    },

    /** @returns Owned count per printing for a user. */
    countByPrintingForUser(userId: string): Promise<{ printingId: string; count: number }[]> {
      return db
        .selectFrom("copies")
        .select((eb) => [
          "printingId" as const,
          eb.cast<number>(eb.fn.count("id"), "integer").as("count"),
        ])
        .where("userId", "=", userId)
        .groupBy("printingId")
        .execute();
    },

    /** @returns Whether a copy exists for the given user (for ownership verification), or `undefined`. */
    existsForUser(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<CopiesTable>, "id"> | undefined> {
      return db
        .selectFrom("copies")
        .select("id")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
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

    /** @returns The inserted copy rows with `id`, `printingId`, `collectionId`, and `acquisitionSourceId`. */
    insertBatch(
      values: Insertable<CopiesTable>[],
    ): Promise<
      Pick<Selectable<CopiesTable>, "id" | "printingId" | "collectionId" | "acquisitionSourceId">[]
    > {
      return db
        .insertInto("copies")
        .values(values)
        .returning(["id", "printingId", "collectionId", "acquisitionSourceId"])
        .execute();
    },

    /** @returns Copies with their current collection name, for move/dispose operations. */
    listWithCollectionName(
      copyIds: string[],
      userId: string,
    ): Promise<
      (Pick<
        Selectable<CopiesTable>,
        "id" | "printingId" | "collectionId" | "acquisitionSourceId"
      > & {
        collectionName: string;
      })[]
    > {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .select([
          "cp.id",
          "cp.printingId",
          "cp.collectionId",
          "cp.acquisitionSourceId",
          "col.name as collectionName",
        ])
        .where("cp.id", "in", copyIds)
        .where("cp.userId", "=", userId)
        .execute();
    },

    /** Moves copies to a target collection. */
    async moveBatch(copyIds: string[], userId: string, toCollectionId: string): Promise<void> {
      await db
        .updateTable("copies")
        .set({ collectionId: toCollectionId })
        .where("id", "in", copyIds)
        .where("userId", "=", userId)
        .execute();
    },

    /** Hard-deletes copies by IDs scoped to a user. */
    async deleteBatch(copyIds: string[], userId: string): Promise<void> {
      await db
        .deleteFrom("copies")
        .where("id", "in", copyIds)
        .where("userId", "=", userId)
        .execute();
    },

    /** @returns Owned count per card+printing from deckbuilding-available collections. */
    countByCardAndPrintingForDeckbuilding(
      userId: string,
    ): Promise<{ cardId: string; printingId: string; count: number }[]> {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .innerJoin("printings as p", "p.id", "cp.printingId")
        .select((eb) => [
          "p.cardId" as const,
          "cp.printingId" as const,
          eb.cast<number>(eb.fn.countAll(), "integer").as("count"),
        ])
        .where("cp.userId", "=", userId)
        .where("col.availableForDeckbuilding", "=", true)
        .groupBy(["p.cardId", "cp.printingId"])
        .execute();
    },
  };
}
