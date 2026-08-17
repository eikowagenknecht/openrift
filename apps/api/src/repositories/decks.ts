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
import type { Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { CardsTable, Database, DeckCardsTable, DecksTable } from "../db/index.js";
import { createsCycle } from "../lib/deck-lineage.js";

/**
 * Input for {@link decksRepo}.`update`: every editable deck column, with the
 * jsonb ones required rather than optional-by-absence, so `"links" in updates`
 * distinguishes "clear it" from "leave it alone".
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
      options?: { includeArchived?: boolean },
    ): Promise<Selectable<DecksTable>[]> {
      let query = db
        .selectFrom("decks")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy((eb) => eb.fn("lower", ["name"]));
      if (!options?.includeArchived) {
        query = query.where("archivedAt", "is", null);
      }
      return await query.execute();
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
      return await db
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
    async create(values: {
      userId: string;
      name: string;
      description: string | null;
      format: DeckFormat;
      formatConfig: DeckFormatConfig | null;
      isPublic: boolean;
      links?: DeckLink[];
    }): Promise<Selectable<DecksTable>> {
      const { links, ...rest } = values;
      return await db
        .insertInto("decks")
        .values({ ...rest, links: links ?? [] })
        .returningAll()
        .executeTakeFirstOrThrow();
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
        dbUpdates.formatConfig = formatConfig ?? null;
      }
      if ("oddsConfig" in updates) {
        dbUpdates.oddsConfig = oddsConfig ?? null;
      }
      if ("links" in updates) {
        dbUpdates.links = links ?? [];
      }
      return await db
        .updateTable("decks")
        .set(dbUpdates)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Deletes a deck. When the deck belonged to a variant family (ADR-042) the
     * family is repaired in the same transaction: a sole survivor reverts to a
     * standalone deck, and a deleted primary hands the flag to the most
     * recently updated survivor. Predecessor pointers detach via the FK.
     *
     * @returns Delete result -- check `numDeletedRows` to verify the row existed.
     */
    deleteByIdForUser(id: string, userId: string): Promise<{ numDeletedRows: bigint }> {
      return db.transaction().execute(async (trx) => {
        const target = await trx
          .selectFrom("decks")
          .select(["familyId", "isPrimary"])
          .where("id", "=", id)
          .where("userId", "=", userId)
          .forUpdate()
          .executeTakeFirst();
        if (!target) {
          return { numDeletedRows: 0n };
        }
        // Read the recency order before the delete, not after: the FK detaching
        // the predecessor pointers is an UPDATE, and the updated_at trigger
        // stamps every touched survivor with the same transaction timestamp.
        // Ordering afterwards would therefore be a tie broken at random.
        const survivors = target.familyId
          ? await trx
              .selectFrom("decks")
              .select(["id", "isPrimary"])
              .where("familyId", "=", target.familyId)
              .where("userId", "=", userId)
              .where("id", "!=", id)
              .orderBy("updatedAt", "desc")
              .execute()
          : [];

        await trx.deleteFrom("decks").where("id", "=", id).where("userId", "=", userId).execute();

        if (target.familyId) {
          if (survivors.length === 1) {
            // A family of one is no family.
            await trx
              .updateTable("decks")
              .set({ familyId: null, isPrimary: false, predecessorDeckId: null })
              .where("id", "=", survivors[0].id)
              .execute();
          } else if (target.isPrimary && survivors.length > 1) {
            await trx
              .updateTable("decks")
              .set({ isPrimary: true })
              .where("id", "=", survivors[0].id)
              .execute();
          }
        }
        return { numDeletedRows: 1n };
      });
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
        .execute();
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
            links: source.links,
            format: source.format,
            // Carry format_config so a cloned Custom-Region deck stays locked
            // to the same region without forcing the user to re-pick. The read
            // hands back the parsed object and the write takes it as-is:
            // postgres.js serializes a jsonb parameter itself, so stringifying
            // here would store the JSON text as a jsonb string scalar.
            formatConfig: source.formatConfig,
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

    /**
     * Copies a deck into its variant family (ADR-042), creating the family on
     * first use (the source becomes primary). Unlike `cloneDeck` this also
     * copies the odds config, cover, home collection, and the full deck plan.
     * `checkpoint` inserts the copy behind the live deck in the predecessor
     * chain (the live deck keeps its id); `variant` makes the copy an editable
     * sibling descending from the source.
     *
     * @returns The new deck row, or `undefined` if the source was not found.
     */
    createVariantCopy(
      id: string,
      userId: string,
      input: { mode: "variant" | "checkpoint"; name?: string },
    ): Promise<Selectable<DecksTable> | undefined> {
      return db.transaction().execute(async (trx) => {
        const source = await trx
          .selectFrom("decks")
          .selectAll()
          .where("id", "=", id)
          .where("userId", "=", userId)
          .forUpdate()
          .executeTakeFirst();
        if (!source) {
          return;
        }

        let familyId = source.familyId;
        if (familyId === null) {
          familyId = crypto.randomUUID();
          await trx
            .updateTable("decks")
            .set({ familyId, isPrimary: true })
            .where("id", "=", id)
            .execute();
        }

        const isCheckpoint = input.mode === "checkpoint";
        const copy = await trx
          .insertInto("decks")
          .values({
            userId,
            name: input.name ?? `${source.name} (${isCheckpoint ? "checkpoint" : "variant"})`,
            description: source.description,
            links: source.links,
            format: source.format,
            formatConfig: source.formatConfig,
            oddsConfig: source.oddsConfig,
            coverCardId: source.coverCardId,
            coverPrintingId: source.coverPrintingId,
            coverPosition: source.coverPosition,
            collectionId: source.collectionId,
            isPublic: false,
            familyId,
            // Checkpoint: the copy takes the live deck's place in the chain
            // (inheriting its predecessor). Variant: the copy descends from
            // the source directly.
            predecessorDeckId: isCheckpoint ? source.predecessorDeckId : source.id,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        if (isCheckpoint) {
          await trx
            .updateTable("decks")
            .set({ predecessorDeckId: copy.id })
            .where("id", "=", id)
            .execute();
        }

        const sourceCards = await trx
          .selectFrom("deckCards")
          .select(["cardId", "zone", "quantity", "preferredPrintingId"])
          .where("deckId", "=", id)
          .execute();
        if (sourceCards.length > 0) {
          await trx
            .insertInto("deckCards")
            .values(sourceCards.map((card) => ({ deckId: copy.id, ...card })))
            .execute();
        }

        const plan = await trx
          .selectFrom("deckPlans")
          .selectAll()
          .where("deckId", "=", id)
          .executeTakeFirst();
        if (plan) {
          await trx
            .insertInto("deckPlans")
            .values({
              deckId: copy.id,
              generalStrategy: plan.generalStrategy,
              mulliganSplit: plan.mulliganSplit,
              mulliganGeneral: plan.mulliganGeneral,
              mulliganFirst: plan.mulliganFirst,
              mulliganSecond: plan.mulliganSecond,
              battlefieldG1CardId: plan.battlefieldG1CardId,
              battlefieldFirstCardId: plan.battlefieldFirstCardId,
              battlefieldSecondCardId: plan.battlefieldSecondCardId,
              battlefieldCustom: plan.battlefieldCustom,
              battlefieldNote: plan.battlefieldNote,
            })
            .execute();
        }

        const matchups = await trx
          .selectFrom("deckMatchupPlans")
          .selectAll()
          .where("deckId", "=", id)
          .orderBy("sortOrder")
          .execute();
        for (const matchup of matchups) {
          const newMatchup = await trx
            .insertInto("deckMatchupPlans")
            .values({
              deckId: copy.id,
              opponentCardId: matchup.opponentCardId,
              opponentLabel: matchup.opponentLabel,
              notes: matchup.notes,
              sortOrder: matchup.sortOrder,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
          const swaps = await trx
            .selectFrom("deckMatchupSwaps")
            .select(["cardId", "direction", "quantity"])
            .where("planId", "=", matchup.id)
            .execute();
          if (swaps.length > 0) {
            await trx
              .insertInto("deckMatchupSwaps")
              .values(swaps.map((swap) => ({ planId: newMatchup.id, ...swap })))
              .execute();
          }
        }

        return copy;
      });
    },

    /**
     * Links two existing decks into one variant family (ADR-042). Both decks
     * must be owned by `userId`. Each side brings its whole family along, so
     * linking a member of family A to a member of family B merges A and B. The
     * merged family keeps the surviving family's primary, falling back to the
     * absorbed family's and finally to the deck being linked from.
     * `markAsPreviousVersion` also records the other deck as this deck's
     * predecessor, and is ignored when this deck already has one.
     *
     * @returns The updated deck row, or a literal describing why nothing changed.
     */
    linkAsVariant(
      id: string,
      userId: string,
      input: { otherDeckId: string; markAsPreviousVersion?: boolean },
    ): Promise<Selectable<DecksTable> | "not-found" | "invalid"> {
      return db.transaction().execute(async (trx) => {
        if (id === input.otherDeckId) {
          return "invalid" as const;
        }
        const rows = await trx
          .selectFrom("decks")
          .select(["id", "familyId", "isPrimary", "predecessorDeckId"])
          .where("id", "in", [id, input.otherDeckId])
          .where("userId", "=", userId)
          .forUpdate()
          .execute();
        const current = rows.find((row) => row.id === id);
        const other = rows.find((row) => row.id === input.otherDeckId);
        if (!current || !other) {
          return "not-found" as const;
        }
        if (current.familyId !== null && current.familyId === other.familyId) {
          return "invalid" as const;
        }

        // This deck's family survives the merge; two standalones start a fresh one.
        const familyId = current.familyId ?? other.familyId ?? crypto.randomUUID();
        const absorbedFamilyIds = [current.familyId, other.familyId].filter(
          (candidate): candidate is string => candidate !== null && candidate !== familyId,
        );
        const standaloneIds = rows.filter((row) => row.familyId === null).map((row) => row.id);

        const primaries = await trx
          .selectFrom("decks")
          .select(["id", "familyId"])
          .where("familyId", "in", [familyId, ...absorbedFamilyIds])
          .where("userId", "=", userId)
          .where("isPrimary", "=", true)
          .execute();
        const keeperId =
          primaries.find((row) => row.familyId === familyId)?.id ?? primaries[0]?.id ?? id;

        // Demote before moving: `uq_decks_family_primary` rejects a second
        // primary the moment the absorbed rows land in the surviving family.
        const demoteIds = [...primaries.map((row) => row.id), ...standaloneIds];
        if (demoteIds.length > 0) {
          await trx
            .updateTable("decks")
            .set({ isPrimary: false })
            .where("id", "in", demoteIds)
            .execute();
        }
        if (absorbedFamilyIds.length > 0) {
          await trx
            .updateTable("decks")
            .set({ familyId })
            .where("familyId", "in", absorbedFamilyIds)
            .where("userId", "=", userId)
            .execute();
        }
        if (standaloneIds.length > 0) {
          await trx
            .updateTable("decks")
            .set({ familyId })
            .where("id", "in", standaloneIds)
            .execute();
        }
        await trx
          .updateTable("decks")
          .set({ isPrimary: true })
          .where("id", "=", keeperId)
          .execute();

        if (input.markAsPreviousVersion && current.predecessorDeckId === null) {
          await trx
            .updateTable("decks")
            .set({ predecessorDeckId: other.id })
            .where("id", "=", id)
            .execute();
        }

        const row = await trx
          .selectFrom("decks")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
        return row;
      });
    },

    /**
     * Removes a deck from its variant family (ADR-042), turning it back into a
     * standalone deck. Members that descended from it inherit its own
     * predecessor, so the chain closes over the gap. The family is then
     * repaired exactly as a deletion repairs it: a sole survivor reverts to
     * standalone, and a departing primary hands the flag to the most recently
     * updated survivor.
     *
     * @returns The updated deck row, or a literal describing why nothing changed.
     */
    unlinkVariant(
      id: string,
      userId: string,
    ): Promise<Selectable<DecksTable> | "not-found" | "no-family"> {
      return db.transaction().execute(async (trx) => {
        const departing = await trx
          .selectFrom("decks")
          .select(["id", "familyId", "isPrimary", "predecessorDeckId"])
          .where("id", "=", id)
          .where("userId", "=", userId)
          .forUpdate()
          .executeTakeFirst();
        if (!departing) {
          return "not-found" as const;
        }
        if (!departing.familyId) {
          return "no-family" as const;
        }

        // Read the recency order before anything writes: the splice below is an
        // UPDATE, and the updated_at trigger stamps every row it touches with
        // the same transaction timestamp. Ordering afterwards would put the
        // spliced rows in a tie broken at random.
        const survivors = await trx
          .selectFrom("decks")
          .select(["id", "isPrimary"])
          .where("familyId", "=", departing.familyId)
          .where("userId", "=", userId)
          .where("id", "!=", id)
          .orderBy("updatedAt", "desc")
          .execute();

        // Splice the chain: B -> A -> C becomes B -> C when A leaves.
        await trx
          .updateTable("decks")
          .set({ predecessorDeckId: departing.predecessorDeckId })
          .where("familyId", "=", departing.familyId)
          .where("userId", "=", userId)
          .where("predecessorDeckId", "=", id)
          .execute();

        // Clearing the departing row first frees the family's primary slot, so
        // promoting a survivor below can't trip `uq_decks_family_primary`.
        await trx
          .updateTable("decks")
          .set({ familyId: null, isPrimary: false, predecessorDeckId: null })
          .where("id", "=", id)
          .execute();

        const [newest] = survivors;
        if (newest && survivors.length === 1) {
          // A family of one is no family.
          await trx
            .updateTable("decks")
            .set({ familyId: null, isPrimary: false, predecessorDeckId: null })
            .where("id", "=", newest.id)
            .execute();
        } else if (newest && departing.isPrimary) {
          await trx
            .updateTable("decks")
            .set({ isPrimary: true })
            .where("id", "=", newest.id)
            .execute();
        }

        const row = await trx
          .selectFrom("decks")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
        return row;
      });
    },

    /**
     * Repoints a deck at another member of its own variant family as its
     * predecessor, or clears the pointer with `null` (ADR-042). Both decks must
     * belong to the same family and the same user. A predecessor that already
     * descends from this deck would close the ancestry into a loop, so the walk
     * up from the proposed parent rejects that case.
     *
     * @returns The updated row, or a literal describing why nothing changed.
     */
    setPredecessor(
      id: string,
      userId: string,
      predecessorDeckId: string | null,
    ): Promise<Selectable<DecksTable> | "not-found" | "invalid"> {
      return db.transaction().execute(async (trx) => {
        if (id === predecessorDeckId) {
          return "invalid" as const;
        }
        const target = await trx
          .selectFrom("decks")
          .select(["id", "familyId"])
          .where("id", "=", id)
          .where("userId", "=", userId)
          .forUpdate()
          .executeTakeFirst();
        if (!target) {
          return "not-found" as const;
        }
        if (predecessorDeckId !== null) {
          if (target.familyId === null) {
            return "invalid" as const;
          }
          const parent = await trx
            .selectFrom("decks")
            .select(["id", "familyId"])
            .where("id", "=", predecessorDeckId)
            .where("userId", "=", userId)
            .executeTakeFirst();
          if (!parent) {
            return "not-found" as const;
          }
          if (parent.familyId !== target.familyId) {
            return "invalid" as const;
          }
          const family = await trx
            .selectFrom("decks")
            .select(["id", "predecessorDeckId"])
            .where("familyId", "=", target.familyId)
            .where("userId", "=", userId)
            .execute();
          if (createsCycle(family, id, predecessorDeckId)) {
            return "invalid" as const;
          }
        }
        const row = await trx
          .updateTable("decks")
          .set({ predecessorDeckId })
          .where("id", "=", id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return row;
      });
    },

    /**
     * Makes a deck the primary of its variant family, demoting the current
     * primary in the same transaction. The partial unique index
     * `uq_decks_family_primary` backstops the one-primary invariant.
     *
     * @returns The updated row, or a literal describing why nothing changed.
     */
    promoteToPrimary(
      id: string,
      userId: string,
    ): Promise<Selectable<DecksTable> | "not-found" | "no-family"> {
      return db.transaction().execute(async (trx) => {
        const target = await trx
          .selectFrom("decks")
          .select(["id", "familyId"])
          .where("id", "=", id)
          .where("userId", "=", userId)
          .forUpdate()
          .executeTakeFirst();
        if (!target) {
          return "not-found" as const;
        }
        if (!target.familyId) {
          return "no-family" as const;
        }
        await trx
          .updateTable("decks")
          .set({ isPrimary: false })
          .where("familyId", "=", target.familyId)
          .where("userId", "=", userId)
          .where("isPrimary", "=", true)
          .where("id", "!=", id)
          .execute();
        const row = await trx
          .updateTable("decks")
          .set({ isPrimary: true })
          .where("id", "=", id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return row;
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
      return await db
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
    async setArchived(
      id: string,
      userId: string,
      archived: boolean,
    ): Promise<Selectable<DecksTable> | undefined> {
      return await db
        .updateTable("decks")
        .set({ archivedAt: archived ? sql`now()` : null })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
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
      return await db
        .updateTable("decks")
        .set({ shareToken, isPublic })
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
      return { deck, ownerName, ownerEmail };
    },

    /**
     * Clones a publicly shared deck into `userId`'s account. The new deck is
     * private (isPublic=false) and named `Copy of <source name>`.
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
            links: source.links,
            format: source.format,
            formatConfig: source.formatConfig,
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
