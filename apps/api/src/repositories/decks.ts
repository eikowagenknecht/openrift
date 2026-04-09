import type { CardType, DeckFormat, DeckZone, Domain, SuperType } from "@openrift/shared/types";
import type { DeleteResult, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { CardsTable, Database, DeckCardsTable, DecksTable } from "../db/index.js";
import { domainsArray, superTypesArray } from "./query-helpers.js";

/** Slim deck card row — card metadata is resolved client-side from the catalog. */
type DeckCardRow = Pick<Selectable<DeckCardsTable>, "cardId" | "zone" | "quantity">;

/** Full deck card row with card details, used for list-page aggregation (type counts, domains, validation). */
type DeckCardDetailRow = Pick<
  Selectable<DeckCardsTable>,
  "id" | "deckId" | "cardId" | "zone" | "quantity"
> &
  Pick<Selectable<CardsTable>, "energy" | "might" | "power"> & {
    cardName: string;
    cardType: CardType;
    domains: Domain[];
    superTypes: SuperType[];
    tags: string[];
    keywords: string[];
    imageUrl: string | null;
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
      let query = db
        .selectFrom("decks")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy((eb) => eb.fn("lower", ["name"]));
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

    /** @returns Deck cards for a deck, scoped to the owning user for defense-in-depth. */
    cardsForDeck(deckId: string, userId: string): Promise<DeckCardRow[]> {
      return db
        .selectFrom("deckCards as dc")
        .innerJoin("decks as d", "d.id", "dc.deckId")
        .select(["dc.cardId", "dc.zone", "dc.quantity"])
        .where("dc.deckId", "=", deckId)
        .where("d.userId", "=", userId)
        .execute();
    },

    /** @returns Deck cards with full card details for a single deck (used by export). */
    cardsWithDetails(deckId: string, userId: string): Promise<DeckCardDetailRow[]> {
      return db
        .selectFrom("deckCards as dc")
        .innerJoin("decks as d", "d.id", "dc.deckId")
        .innerJoin("cards as c", "c.id", "dc.cardId")
        .select([
          "dc.id",
          "dc.deckId",
          "dc.cardId",
          "dc.zone",
          "dc.quantity",
          "c.name as cardName",
          "c.type as cardType",
          "c.tags",
          "c.keywords",
          "c.energy",
          "c.might",
          "c.power",
          domainsArray("dc.cardId").as("domains"),
          superTypesArray("dc.cardId").as("superTypes"),
          sql<string | null>`(
            SELECT COALESCE(pi.rehosted_url, pi.original_url)
            FROM printings p
            JOIN sets s ON s.id = p.set_id
            JOIN printing_images pi ON pi.printing_id = p.id
              AND pi.face = 'front' AND pi.is_active = true
            WHERE p.card_id = dc.card_id
            ORDER BY
              (p.art_variant = 'normal')::int DESC,
              (p.promo_type_id IS NULL)::int DESC,
              (p.is_signed = false)::int DESC,
              (p.finish = 'normal')::int DESC,
              s.sort_order ASC,
              p.short_code ASC
            LIMIT 1
          )`.as("imageUrl"),
        ])
        .where("dc.deckId", "=", deckId)
        .where("d.userId", "=", userId)
        .orderBy("dc.zone")
        .orderBy("c.name")
        .execute() as Promise<DeckCardDetailRow[]>;
    },

    /** @returns All deck cards with card details for every deck owned by a user. */
    allCardsForUser(userId: string): Promise<DeckCardDetailRow[]> {
      return db
        .selectFrom("deckCards as dc")
        .innerJoin("decks as d", "d.id", "dc.deckId")
        .innerJoin("cards as c", "c.id", "dc.cardId")
        .select([
          "dc.id",
          "dc.deckId",
          "dc.cardId",
          "dc.zone",
          "dc.quantity",
          "c.name as cardName",
          "c.type as cardType",
          domainsArray("c.id").as("domains"),
          superTypesArray("c.id").as("superTypes"),
          "c.tags",
          "c.keywords",
          "c.energy",
          "c.might",
          "c.power",
          sql<string | null>`null`.as("imageUrl"),
        ])
        .where("d.userId", "=", userId)
        .orderBy("dc.deckId")
        .orderBy("dc.zone")
        .orderBy("c.name")
        .execute() as Promise<DeckCardDetailRow[]>;
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

    /** @returns Owned copy count per card from deckbuilding-available collections, filtered to the given card IDs. */
    availableCopiesByCard(
      userId: string,
      cardIds: string[],
    ): Promise<{ cardId: string; count: number }[]> {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .innerJoin("printings as p", "p.id", "cp.printingId")
        .select((eb) => [
          "p.cardId" as const,
          eb.cast<number>(eb.fn.countAll(), "integer").as("count"),
        ])
        .where("cp.userId", "=", userId)
        .where("col.availableForDeckbuilding", "=", true)
        .where("p.cardId", "in", cardIds)
        .groupBy("p.cardId")
        .execute();
    },

    /** Replaces all cards in a deck within a transaction. Deletes existing cards, inserts new ones, and touches updatedAt. */
    async replaceCards(
      deckId: string,
      cards: { cardId: string; zone: DeckZone; quantity: number }[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom("deckCards").where("deckId", "=", deckId).execute();

        if (cards.length > 0) {
          await trx
            .insertInto("deckCards")
            .values(cards.map((card) => ({ deckId, ...card })))
            .execute();
        }

        // Touch the parent deck so its updated_at advances via trigger
        await trx
          .updateTable("decks")
          .set({ updatedAt: sql`now()` })
          .where("id", "=", deckId)
          .execute();
      });
    },

    /** @returns The new deck row, or `undefined` if the source deck was not found. */
    async cloneDeck(id: string, userId: string): Promise<Selectable<DecksTable> | undefined> {
      const source = await db
        .selectFrom("decks")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();

      if (!source) {
        return undefined;
      }

      return db.transaction().execute(async (trx) => {
        const newDeck = await trx
          .insertInto("decks")
          .values({
            userId,
            name: `${source.name} (Copy)`,
            description: source.description,
            format: source.format,
            isWanted: source.isWanted,
            isPublic: false,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        const sourceCards = await trx
          .selectFrom("deckCards")
          .select(["cardId", "zone", "quantity"])
          .where("deckId", "=", id)
          .execute();

        if (sourceCards.length > 0) {
          await trx
            .insertInto("deckCards")
            .values(sourceCards.map((card) => ({ deckId: newDeck.id, ...card })))
            .execute();
        }

        return newDeck;
      });
    },

    /** @returns Card requirements from all wanted decks for a user, with deck name. */
    wantedCardRequirements(
      userId: string,
    ): Promise<{ deckId: string; deckName: string; cardId: string; quantity: number }[]> {
      return db
        .selectFrom("deckCards as dc")
        .innerJoin("decks as d", "d.id", "dc.deckId")
        .select(["d.id as deckId", "d.name as deckName", "dc.cardId", "dc.quantity"])
        .where("d.userId", "=", userId)
        .where("d.isWanted", "=", true)
        .execute();
    },
  };
}
