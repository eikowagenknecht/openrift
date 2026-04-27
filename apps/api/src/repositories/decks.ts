import type { CardType, DeckFormat, DeckZone, Domain, SuperType } from "@openrift/shared/types";
import type { DeleteResult, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { CardsTable, Database, DeckCardsTable, DecksTable } from "../db/index.js";

/** Slim deck card row — card metadata is resolved client-side from the catalog. */
type DeckCardRow = Pick<
  Selectable<DeckCardsTable>,
  "cardId" | "zone" | "quantity" | "preferredPrintingId"
>;

/** Full deck card row with card details, used for list-page aggregation (type counts, domains, validation). */
type DeckCardDetailRow = Pick<
  Selectable<DeckCardsTable>,
  "id" | "deckId" | "cardId" | "zone" | "quantity" | "preferredPrintingId"
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
    /**
     * @returns Decks for a user, ordered by name. Archived decks are excluded
     * unless `options.includeArchived` is true.
     */
    listForUser(
      userId: string,
      options?: { wantedOnly?: boolean; includeArchived?: boolean },
    ): Promise<Selectable<DecksTable>[]> {
      let query = db
        .selectFrom("decks")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy((eb) => eb.fn("lower", ["name"]));
      if (options?.wantedOnly) {
        query = query.where("isWanted", "=", true);
      }
      if (!options?.includeArchived) {
        query = query.where("archivedAt", "is", null);
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
        .select(["dc.cardId", "dc.zone", "dc.quantity", "dc.preferredPrintingId"])
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
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "dc.cardId")
        .select([
          "dc.id",
          "dc.deckId",
          "dc.cardId",
          "dc.zone",
          "dc.quantity",
          "dc.preferredPrintingId",
          "c.name as cardName",
          "c.type as cardType",
          "c.tags",
          "c.keywords",
          "c.energy",
          "c.might",
          "c.power",
          "mca.domains",
          "mca.superTypes",
          sql<string | null>`(
            SELECT COALESCE(ci.rehosted_url, ci.original_url)
            FROM printings p
            JOIN sets s ON s.id = p.set_id
            JOIN printing_images pi ON pi.printing_id = p.id
              AND pi.face = 'front' AND pi.is_active = true
            JOIN image_files ci ON ci.id = pi.image_file_id
            WHERE p.card_id = dc.card_id
            ORDER BY
              (p.art_variant = 'normal')::int DESC,
              (cardinality(p.marker_slugs) = 0)::int DESC,
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
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "c.id")
        .select([
          "dc.id",
          "dc.deckId",
          "dc.cardId",
          "dc.zone",
          "dc.quantity",
          "dc.preferredPrintingId",
          "c.name as cardName",
          "c.type as cardType",
          "mca.domains",
          "mca.superTypes",
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
      cards: {
        cardId: string;
        zone: DeckZone;
        quantity: number;
        preferredPrintingId: string | null;
      }[],
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
          .select(["cardId", "zone", "quantity", "preferredPrintingId"])
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

    /**
     * Toggles a deck's pinned status, scoped to the owning user.
     * @returns The updated deck row, or `undefined` if the deck is not owned by the user.
     */
    setPinned(
      id: string,
      userId: string,
      isPinned: boolean,
    ): Promise<Selectable<DecksTable> | undefined> {
      return db
        .updateTable("decks")
        .set({ isPinned })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Archives or unarchives a deck. When archived, sets archived_at to now;
     * when unarchived, nulls it. Scoped to the owning user.
     * @returns The updated deck row, or `undefined` if the deck is not owned by the user.
     */
    setArchived(
      id: string,
      userId: string,
      archived: boolean,
    ): Promise<Selectable<DecksTable> | undefined> {
      return db
        .updateTable("decks")
        .set({ archivedAt: archived ? sql`now()` : null })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Sets (or nulls) the share_token and is_public on a deck, scoped to the owning user.
     * @returns The updated deck row, or `undefined` if the deck is not owned by the user.
     */
    setShareToken(
      id: string,
      userId: string,
      shareToken: string | null,
      isPublic: boolean,
    ): Promise<Selectable<DecksTable> | undefined> {
      return db
        .updateTable("decks")
        .set({ shareToken, isPublic, updatedAt: sql`now()` })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Looks up a public deck by its share token. Anonymous — no user scoping.
     * @returns The deck row and owner display name, or `undefined` if the token
     * doesn't match a public deck.
     */
    async findByShareToken(
      shareToken: string,
    ): Promise<{ deck: Selectable<DecksTable>; ownerName: string | null } | undefined> {
      const row = await db
        .selectFrom("decks as d")
        .innerJoin("users as u", "u.id", "d.userId")
        .selectAll("d")
        .select("u.name as ownerName")
        .where("d.shareToken", "=", shareToken)
        .where("d.isPublic", "=", true)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const { ownerName, ...deck } = row;
      return { deck, ownerName };
    },

    /**
     * Clones a publicly shared deck into `userId`'s account. The new deck is
     * private (isPublic=false, isWanted=false) and named `Copy of <source name>`.
     * @returns The new deck row, or `undefined` if the token is not a public deck.
     */
    async cloneFromShareToken(
      shareToken: string,
      userId: string,
    ): Promise<Selectable<DecksTable> | undefined> {
      const source = await db
        .selectFrom("decks")
        .selectAll()
        .where("shareToken", "=", shareToken)
        .where("isPublic", "=", true)
        .executeTakeFirst();

      if (!source) {
        return undefined;
      }

      return db.transaction().execute(async (trx) => {
        const newDeck = await trx
          .insertInto("decks")
          .values({
            userId,
            name: `Copy of ${source.name}`,
            description: source.description,
            format: source.format,
            isWanted: false,
            isPublic: false,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        const sourceCards = await trx
          .selectFrom("deckCards")
          .select(["cardId", "zone", "quantity", "preferredPrintingId"])
          .where("deckId", "=", source.id)
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
  };
}
