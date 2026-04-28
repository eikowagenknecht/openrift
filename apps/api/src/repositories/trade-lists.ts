import type { CardType } from "@openrift/shared/types";
import type { DeleteResult, Kysely, Selectable } from "kysely";

import type {
  CopiesTable,
  Database,
  PrintingsTable,
  TradeListItemsTable,
  TradeListsTable,
} from "../db/index.js";
import { imageId } from "./query-helpers.js";

/** Trade list item row with copy, printing, card, and image details. */
type TradeListItemRow = Pick<Selectable<TradeListItemsTable>, "id" | "tradeListId" | "copyId"> &
  Pick<Selectable<CopiesTable>, "printingId" | "collectionId"> &
  Pick<Selectable<PrintingsTable>, "setId" | "rarity" | "finish"> & {
    imageId: string | null;
    cardName: string;
    cardType: CardType;
  };

/**
 * Queries for user trade lists and their items.
 *
 * @returns An object with trade list query methods bound to the given `db`.
 */
export function tradeListsRepo(db: Kysely<Database>) {
  return {
    /** @returns All trade lists for a user, ordered by name. */
    listForUser(userId: string): Promise<Selectable<TradeListsTable>[]> {
      return db
        .selectFrom("tradeLists")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy("name")
        .execute();
    },

    /** @returns A single trade list by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<Selectable<TradeListsTable> | undefined> {
      return db
        .selectFrom("tradeLists")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Whether the trade list exists for the given user. */
    exists(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<TradeListsTable>, "id"> | undefined> {
      return db
        .selectFrom("tradeLists")
        .select("id")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns The newly created trade list row. */
    create(values: {
      userId: string;
      name: string;
      rules: string | null;
    }): Promise<Selectable<TradeListsTable>> {
      return db.insertInto("tradeLists").values(values).returningAll().executeTakeFirstOrThrow();
    },

    /** @returns The updated trade list row, or `undefined` if not found. */
    update(
      id: string,
      userId: string,
      updates: Record<string, unknown>,
    ): Promise<Selectable<TradeListsTable> | undefined> {
      return db
        .updateTable("tradeLists")
        .set(updates)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    deleteByIdForUser(id: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("tradeLists")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Trade list items joined with copy, printing, card, and image details. Scoped to the owning user for defense-in-depth. */
    itemsWithDetails(tradeListId: string, userId: string): Promise<TradeListItemRow[]> {
      return db
        .selectFrom("tradeListItems as tli")
        .innerJoin("copies as cp", "cp.id", "tli.copyId")
        .innerJoin("printings as p", "p.id", "cp.printingId")
        .innerJoin("cards as card", "card.id", "p.cardId")
        .leftJoin("printingImages as pi", (join) =>
          join
            .onRef("pi.printingId", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.isActive", "=", true),
        )
        .leftJoin("imageFiles as ci", "ci.id", "pi.imageFileId")
        .select([
          "tli.id",
          "tli.tradeListId",
          "tli.copyId",
          "cp.printingId",
          "cp.collectionId",
          imageId("ci").as("imageId"),
          "p.setId",
          "p.rarity",
          "p.finish",
          "card.name as cardName",
          "card.type as cardType",
        ])
        .where("tli.tradeListId", "=", tradeListId)
        .where("tli.userId", "=", userId)
        .orderBy("card.name")
        .execute();
    },

    /** @returns The newly created trade list item row. */
    createItem(values: {
      tradeListId: string;
      userId: string;
      copyId: string;
    }): Promise<Selectable<TradeListItemsTable>> {
      return db
        .insertInto("tradeListItems")
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the item existed. */
    deleteItem(itemId: string, tradeListId: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("tradeListItems")
        .where("id", "=", itemId)
        .where("tradeListId", "=", tradeListId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },
  };
}
