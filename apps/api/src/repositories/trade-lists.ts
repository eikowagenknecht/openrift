import type { CardType } from "@openrift/shared/types";
import type { DeleteResult, Kysely, Selectable } from "kysely";

import { imageUrl } from "../db-helpers.js";
import type {
  CopiesTable,
  Database,
  PrintingsTable,
  TradeListItemsTable,
  TradeListsTable,
} from "../db/index.js";

/** Trade list item row with copy, printing, card, and image details. */
type TradeListItemRow = Pick<Selectable<TradeListItemsTable>, "id" | "trade_list_id" | "copy_id"> &
  Pick<Selectable<CopiesTable>, "printing_id" | "collection_id"> &
  Pick<Selectable<PrintingsTable>, "set_id" | "collector_number" | "rarity" | "finish"> & {
    image_url: string | null;
    card_name: string;
    card_type: CardType;
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
        .selectFrom("trade_lists")
        .selectAll()
        .where("user_id", "=", userId)
        .orderBy("name")
        .execute();
    },

    /** @returns A single trade list by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<Selectable<TradeListsTable> | undefined> {
      return db
        .selectFrom("trade_lists")
        .selectAll()
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Whether the trade list exists for the given user. */
    exists(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<TradeListsTable>, "id"> | undefined> {
      return db
        .selectFrom("trade_lists")
        .select("id")
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    /** @returns The newly created trade list row. */
    create(values: {
      user_id: string;
      name: string;
      rules: string | null;
    }): Promise<Selectable<TradeListsTable>> {
      return db.insertInto("trade_lists").values(values).returningAll().executeTakeFirstOrThrow();
    },

    /** @returns The updated trade list row, or `undefined` if not found. */
    update(
      id: string,
      userId: string,
      updates: Record<string, unknown>,
    ): Promise<Selectable<TradeListsTable> | undefined> {
      return db
        .updateTable("trade_lists")
        .set(updates)
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the row existed. */
    deleteByIdForUser(id: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("trade_lists")
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Trade list items joined with copy, printing, card, and image details. */
    itemsWithDetails(tradeListId: string): Promise<TradeListItemRow[]> {
      return db
        .selectFrom("trade_list_items as tli")
        .innerJoin("copies as cp", "cp.id", "tli.copy_id")
        .innerJoin("printings as p", "p.id", "cp.printing_id")
        .innerJoin("cards as card", "card.id", "p.card_id")
        .leftJoin("printing_images as pi", (join) =>
          join
            .onRef("pi.printing_id", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.is_active", "=", true),
        )
        .select([
          "tli.id",
          "tli.trade_list_id",
          "tli.copy_id",
          "cp.printing_id",
          "cp.collection_id",
          imageUrl("pi").as("image_url"),
          "p.set_id",
          "p.collector_number",
          "p.rarity",
          "p.finish",
          "card.name as card_name",
          "card.type as card_type",
        ])
        .where("tli.trade_list_id", "=", tradeListId)
        .orderBy("card.name")
        .execute();
    },

    /** @returns The newly created trade list item row. */
    createItem(values: {
      trade_list_id: string;
      user_id: string;
      copy_id: string;
    }): Promise<Selectable<TradeListItemsTable>> {
      return db
        .insertInto("trade_list_items")
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** @returns Delete result — check `numDeletedRows` to verify the item existed. */
    deleteItem(itemId: string, tradeListId: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("trade_list_items")
        .where("id", "=", itemId)
        .where("trade_list_id", "=", tradeListId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },

    /** @returns A copy by ID scoped to a user (for ownership verification), or `undefined`. */
    copyExistsForUser(
      copyId: string,
      userId: string,
    ): Promise<Pick<Selectable<CopiesTable>, "id"> | undefined> {
      return db
        .selectFrom("copies")
        .select("id")
        .where("id", "=", copyId)
        .where("user_id", "=", userId)
        .executeTakeFirst();
    },
  };
}
