import { WellKnown } from "@openrift/shared";
import type {
  CardType,
  DeckFormat,
  DeckFormatConfig,
  DeckLink,
  DeckOddsConfig,
  DeckZone,
  Domain,
  SuperType,
} from "@openrift/shared/types";
import type { DeleteResult, Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import { parseJsonb, parseJsonbRequired } from "../db/helpers.js";
import type { CardsTable, Database, DeckCardsTable, DecksTable } from "../db/index.js";

function serializeFormatConfig(value: DeckFormatConfig | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function serializeOddsConfig(value: DeckOddsConfig | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

/**
 * The stored shapes are enforced at the write boundary (`validateFormatConfig`
 * for the format config, `deckOddsConfigSchema` for the odds config,
 * `deckLinkSchema` for the links), so the casts {@link parseJsonb} performs
 * are safe at read time.
 * @returns The row with its jsonb columns parsed (null when a column was NULL).
 */
function withParsedJsonb<
  T extends {
    formatConfig: DeckFormatConfig | string | null;
    oddsConfig: DeckOddsConfig | string | null;
    links: DeckLink[] | string;
  },
>(
  row: T,
): T & {
  formatConfig: DeckFormatConfig | null;
  oddsConfig: DeckOddsConfig | null;
  links: DeckLink[];
} {
  return {
    ...row,
    formatConfig: parseJsonb<DeckFormatConfig>(row.formatConfig),
    oddsConfig: parseJsonb<DeckOddsConfig>(row.oddsConfig),
    links: parseJsonbRequired<DeckLink[]>(row.links),
  };
}

/**
 * Input for {@link decksRepo}.`update`: every editable deck column, but with
 * `formatConfig` / `oddsConfig` as their structured shapes (the repo
 * serializes them before writing) rather than the columns' stored string form.
 */
export type DeckUpdateInput = Omit<
  Updateable<DecksTable>,
  "formatConfig" | "oddsConfig" | "links"
> & {
  formatConfig?: DeckFormatConfig | null;
  oddsConfig?: DeckOddsConfig | null;
  links?: DeckLink[];
};

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
  Pick<Selectable<CardsTable>, "energy" | "might" | "power" | "maxCopiesOverride"> & {
    cardName: string;
    cardType: CardType;
    cardTypes: CardType[];
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
    async listForUser(
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
      const rows = await query.execute();
      return rows.map((row) => withParsedJsonb(row));
    },

    /**
     * The user's decks that name a home collection, so the collections list can
     * mark which of them are deck boxes. Archived decks are included — an
     * archived deck still physically sits in its box.
     * @returns Deck id, name, and the collection it is stored in, ordered by name.
     */
    listHomeCollectionDecks(
      userId: string,
    ): Promise<{ id: string; name: string; collectionId: string }[]> {
      return db
        .selectFrom("decks")
        .select(["id", "name", "collectionId"])
        .where("userId", "=", userId)
        .where("collectionId", "is not", null)
        .orderBy((eb) => eb.fn("lower", ["name"]))
        .$narrowType<{ collectionId: string }>()
        .execute();
    },

    /** @returns A single deck by ID scoped to a user, or `undefined`. */
    async getByIdForUser(id: string, userId: string): Promise<Selectable<DecksTable> | undefined> {
      const row = await db
        .selectFrom("decks")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return row === undefined ? undefined : withParsedJsonb(row);
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
    async create(values: {
      userId: string;
      name: string;
      description: string | null;
      format: DeckFormat;
      formatConfig: DeckFormatConfig | null;
      isWanted: boolean;
      isPublic: boolean;
      links?: DeckLink[];
    }): Promise<Selectable<DecksTable>> {
      const { links, ...rest } = values;
      const row = await db
        .insertInto("decks")
        .values({
          ...rest,
          formatConfig: serializeFormatConfig(values.formatConfig),
          links: JSON.stringify(links ?? []),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return withParsedJsonb(row);
    },

    /** @returns The updated deck row, or `undefined` if not found. */
    async update(
      id: string,
      userId: string,
      updates: DeckUpdateInput,
    ): Promise<Selectable<DecksTable> | undefined> {
      const { formatConfig, oddsConfig, links, ...rest } = updates;
      const dbUpdates: Updateable<DecksTable> = { ...rest };
      if ("formatConfig" in updates) {
        dbUpdates.formatConfig = serializeFormatConfig(formatConfig ?? null);
      }
      if ("oddsConfig" in updates) {
        dbUpdates.oddsConfig = serializeOddsConfig(oddsConfig ?? null);
      }
      if ("links" in updates) {
        dbUpdates.links = JSON.stringify(links ?? []);
      }
      const row = await db
        .updateTable("decks")
        .set(dbUpdates)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
      if (!row) {
        return undefined;
      }
      // Both jsonb columns, not just formatConfig: an unparsed oddsConfig
      // string fails deckResponseSchema output validation on the PATCH reply.
      return withParsedJsonb(row);
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
          "mca.types as cardTypes",
          "c.tags",
          "c.keywords",
          "c.energy",
          "c.might",
          "c.power",
          "c.maxCopiesOverride",
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
              (p.art_variant = ${WellKnown.artVariant.NORMAL})::int DESC,
              (cardinality(p.marker_slugs) = 0)::int DESC,
              (p.is_signed = false)::int DESC,
              (p.finish = ${WellKnown.finish.NORMAL})::int DESC,
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
          "mca.types as cardTypes",
          "mca.domains",
          "mca.superTypes",
          "c.tags",
          "c.keywords",
          "c.energy",
          "c.might",
          "c.power",
          "c.maxCopiesOverride",
          sql<string | null>`null`.as("imageUrl"),
        ])
        .where("d.userId", "=", userId)
        .orderBy("dc.deckId")
        .orderBy("dc.zone")
        .orderBy("c.name")
        .execute() as Promise<DeckCardDetailRow[]>;
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
            links: JSON.stringify(parseJsonbRequired<DeckLink[]>(source.links)),
            format: source.format,
            // Carry format_config so a cloned Custom-Region deck stays locked
            // to the same region without forcing the user to re-pick.
            // Re-encode through serialize to handle the raw-string shape
            // postgres.js returns for jsonb reads.
            formatConfig: serializeFormatConfig(parseJsonb<DeckFormatConfig>(source.formatConfig)),
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

        return withParsedJsonb(newDeck);
      });
    },

    /**
     * Toggles a deck's pinned status, scoped to the owning user.
     * @returns The updated deck row, or `undefined` if the deck is not owned by the user.
     */
    async setPinned(
      id: string,
      userId: string,
      isPinned: boolean,
    ): Promise<Selectable<DecksTable> | undefined> {
      const row = await db
        .updateTable("decks")
        .set({ isPinned })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
      return row === undefined ? undefined : withParsedJsonb(row);
    },

    /**
     * Archives or unarchives a deck. When archived, sets archived_at to now;
     * when unarchived, nulls it. Scoped to the owning user.
     * @returns The updated deck row, or `undefined` if the deck is not owned by the user.
     */
    async setArchived(
      id: string,
      userId: string,
      archived: boolean,
    ): Promise<Selectable<DecksTable> | undefined> {
      const row = await db
        .updateTable("decks")
        .set({ archivedAt: archived ? sql`now()` : null })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
      return row === undefined ? undefined : withParsedJsonb(row);
    },

    /**
     * Reads the current share state of a deck, scoped to the owning user.
     * Non-mutating — used by GET /decks/:id/share so an owned-but-unshared
     * deck reports `{ shareToken: null, isPublic: false }` instead of 404ing.
     * @returns `{ shareToken, isPublic }`, or `undefined` if the deck is not
     * owned by the user (lets the route 404 only for missing/foreign decks).
     */
    getShareState(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<DecksTable>, "shareToken" | "isPublic"> | undefined> {
      return db
        .selectFrom("decks")
        .select(["shareToken", "isPublic"])
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Sets (or nulls) the share_token and is_public on a deck, scoped to the owning user.
     * @returns The updated deck row, or `undefined` if the deck is not owned by the user.
     */
    async setShareToken(
      id: string,
      userId: string,
      shareToken: string | null,
      isPublic: boolean,
    ): Promise<Selectable<DecksTable> | undefined> {
      const row = await db
        .updateTable("decks")
        .set({ shareToken, isPublic })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
      return row === undefined ? undefined : withParsedJsonb(row);
    },

    /**
     * Looks up a public deck by its share token. Anonymous — no user scoping.
     * @returns The deck row and owner display name, or `undefined` if the token
     * doesn't match a public deck.
     */
    async findByShareToken(
      shareToken: string,
    ): Promise<
      { deck: Selectable<DecksTable>; ownerName: string | null; ownerEmail: string } | undefined
    > {
      const row = await db
        .selectFrom("decks as d")
        .innerJoin("users as u", "u.id", "d.userId")
        .selectAll("d")
        .select(["u.name as ownerName", "u.email as ownerEmail"])
        .where("d.shareToken", "=", shareToken)
        .where("d.isPublic", "=", true)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const { ownerName, ownerEmail, ...deck } = row;
      return { deck: withParsedJsonb(deck), ownerName, ownerEmail };
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
            links: JSON.stringify(parseJsonbRequired<DeckLink[]>(source.links)),
            format: source.format,
            formatConfig: serializeFormatConfig(parseJsonb<DeckFormatConfig>(source.formatConfig)),
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

        return withParsedJsonb(newDeck);
      });
    },
  };
}
