import type { CardType, DeckFormat } from "@openrift/shared/types";
import type { DeleteResult, Kysely, Selectable } from "kysely";

import type { CardsTable, Database, DeckCardsTable, DecksTable } from "../db/index.js";

/** Deck card row with card details. */
type DeckCardRow = Pick<
  Selectable<DeckCardsTable>,
  "id" | "deckId" | "cardId" | "zone" | "quantity"
> &
  Pick<Selectable<CardsTable>, "domains" | "energy" | "might" | "power"> & {
    cardName: string;
    cardType: CardType;
  };

/**
 * Queries for user decks and deck cards.
 *
 * @returns An object with deck query methods bound to the given `db`.
 */
export function decksRepo(db: Kysely<Database>) {
  return {
    /** @returns All decks for a user, optionally filtered to wanted-only, ordered by name. */
    listForUser(userId: string, wantedOnly?: boolean): Promise<Selectable<DecksTable>[]> {
      let query = db.selectFrom("decks").selectAll().where("userId", "=", userId).orderBy("name");
      if (wantedOnly) {
        query = query.where("isWanted", "=", true);
      }
      return query.execute();
    },

    /** @returns A single deck by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<Selectable<DecksTable> | undefined> {
      return db
        .selectFrom("decks")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns The deck's `id` and `format`, or `undefined` if not found. */
    getIdAndFormat(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<DecksTable>, "id" | "format"> | undefined> {
      return db
        .selectFrom("decks")
        .select(["id", "format"])
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Whether the deck exists for the given user. */
    exists(id: string, userId: string): Promise<Pick<Selectable<DecksTable>, "id"> | undefined> {
      return db
        .selectFrom("decks")
        .select("id")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns The newly created deck row. */
    create(values: {
      userId: string;
      name: string;
      description: string | null;
      format: DeckFormat;
      isWanted: boolean;
      isPublic: boolean;
    }): Promise<Selectable<DecksTable>> {
      return db.insertInto("decks").values(values).returningAll().executeTakeFirstOrThrow();
    },

    /** @returns The updated deck row, or `undefined` if not found. */
    update(
      id: string,
      userId: string,
      updates: Record<string, unknown>,
    ): Promise<Selectable<DecksTable> | undefined> {
      return db
        .updateTable("decks")
        .set(updates)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns Delete result -- check `numDeletedRows` to verify the row existed. */
    deleteByIdForUser(id: string, userId: string): Promise<DeleteResult> {
      return db
        .deleteFrom("decks")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** @returns Deck cards joined with card details, ordered by zone then name. */
    cardsWithDetails(deckId: string): Promise<DeckCardRow[]> {
      return db
        .selectFrom("deckCards as dc")
        .innerJoin("cards as c", "c.id", "dc.cardId")
        .select([
          "dc.id",
          "dc.deckId",
          "dc.cardId",
          "dc.zone",
          "dc.quantity",
          "c.name as cardName",
          "c.type as cardType",
          "c.domains",
          "c.energy",
          "c.might",
          "c.power",
        ])
        .where("dc.deckId", "=", deckId)
        .orderBy("dc.zone")
        .orderBy("c.name")
        .execute();
    },

    /** @returns Card requirements for a deck (cardId, zone, quantity). */
    cardRequirements(
      deckId: string,
    ): Promise<Pick<Selectable<DeckCardsTable>, "cardId" | "zone" | "quantity">[]> {
      return db
        .selectFrom("deckCards")
        .select(["cardId", "zone", "quantity"])
        .where("deckId", "=", deckId)
        .execute();
    },

    /** @returns Owned copy count per card from deckbuilding-available collections. */
    availableCopiesByCard(userId: string): Promise<{ cardId: string; count: number }[]> {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .innerJoin("printings as p", "p.id", "cp.printingId")
        .select(["p.cardId", db.fn.countAll<number>().as("count")])
        .where("cp.userId", "=", userId)
        .where("col.availableForDeckbuilding", "=", true)
        .groupBy("p.cardId")
        .execute();
    },
  };
}
