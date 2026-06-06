import type {
  CardType,
  DeckFormat,
  DeckFormatConfig,
  DeckZone,
  Domain,
  SuperType,
} from "@openrift/shared/types";
import type { DeleteResult, Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { CardsTable, Database, DeckCardsTable, DecksTable } from "../db/index.js";

/**
 * postgres.js under Bun returns jsonb columns as raw JSON strings rather
 * than parsed objects (mirrors the helpers in user-preferences and
 * printing-events). The shape is enforced by `validateFormatConfig` at the
 * write boundary, so the parsed cast is safe at read time.
 *
 * @returns The parsed config object, or null if the column was NULL.
 */
function parseFormatConfig(value: DeckFormatConfig | string | null): DeckFormatConfig | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return JSON.parse(value) as DeckFormatConfig;
  }
  return value;
}

function serializeFormatConfig(value: DeckFormatConfig | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function withParsedFormatConfig<T extends { formatConfig: DeckFormatConfig | string | null }>(
  row: T,
): T & { formatConfig: DeckFormatConfig | null } {
  return { ...row, formatConfig: parseFormatConfig(row.formatConfig) };
}

/**
 * Input for {@link decksRepo}.`update`: every editable deck column, but with
 * `formatConfig` as the structured {@link DeckFormatConfig} (the repo
 * serializes it before writing) rather than the column's stored string form.
 */
export type DeckUpdateInput = Omit<Updateable<DecksTable>, "formatConfig"> & {
  formatConfig?: DeckFormatConfig | null;
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
      return rows.map((row) => withParsedFormatConfig(row));
    },

    /** @returns A single deck by ID scoped to a user, or `undefined`. */
    async getByIdForUser(id: string, userId: string): Promise<Selectable<DecksTable> | undefined> {
      const row = await db
        .selectFrom("decks")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return row === undefined ? undefined : withParsedFormatConfig(row);
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
    }): Promise<Selectable<DecksTable>> {
      const row = await db
        .insertInto("decks")
        .values({ ...values, formatConfig: serializeFormatConfig(values.formatConfig) })
        .returningAll()
        .executeTakeFirstOrThrow();
      return { ...row, formatConfig: parseFormatConfig(row.formatConfig) };
    },

    /** @returns The updated deck row, or `undefined` if not found. */
    async update(
      id: string,
      userId: string,
      updates: DeckUpdateInput,
    ): Promise<Selectable<DecksTable> | undefined> {
      const { formatConfig, ...rest } = updates;
      const dbUpdates: Updateable<DecksTable> = { ...rest };
      if ("formatConfig" in updates) {
        dbUpdates.formatConfig = serializeFormatConfig(formatConfig ?? null);
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
      return { ...row, formatConfig: parseFormatConfig(row.formatConfig) };
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

    /**
     * Owned copy count per card from collections that feed the viewer's deck
     * inventory, filtered to the given card IDs. A collection counts when it's
     * accessible to the viewer (personal owner or group member) AND
     * deck-building-available for them: `COALESCE(pref.available,
     * group_id IS NULL)` — personal default on, group collections opt-in.
     * @returns Owned copy count per card across the viewer's deck-available collections.
     */
    availableCopiesByCard(
      userId: string,
      cardIds: string[],
    ): Promise<{ cardId: string; count: number }[]> {
      return db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .innerJoin("printings as p", "p.id", "cp.printingId")
        .leftJoin("friendGroupMembers as gm", (join) =>
          join.onRef("gm.groupId", "=", "col.groupId").on("gm.userId", "=", userId),
        )
        .leftJoin("collectionDeckbuildingPrefs as pref", (join) =>
          join.onRef("pref.collectionId", "=", "col.id").on("pref.userId", "=", userId),
        )
        .select((eb) => [
          "p.cardId" as const,
          eb.cast<number>(eb.fn.countAll(), "integer").as("count"),
        ])
        .where((eb) => eb.or([eb("col.userId", "=", userId), eb("gm.userId", "=", userId)]))
        .where(sql`coalesce(pref.available, col.group_id is null)`, "=", true)
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
            // Carry format_config so a cloned Custom-Region deck stays locked
            // to the same region without forcing the user to re-pick.
            // Re-encode through serialize to handle the raw-string shape
            // postgres.js returns for jsonb reads.
            formatConfig: serializeFormatConfig(parseFormatConfig(source.formatConfig)),
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

        return withParsedFormatConfig(newDeck);
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
      return row === undefined ? undefined : withParsedFormatConfig(row);
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
      return row === undefined ? undefined : withParsedFormatConfig(row);
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
      return row === undefined ? undefined : withParsedFormatConfig(row);
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
      return { deck: withParsedFormatConfig(deck), ownerName, ownerEmail };
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
            formatConfig: serializeFormatConfig(parseFormatConfig(source.formatConfig)),
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

        return withParsedFormatConfig(newDeck);
      });
    },
  };
}
