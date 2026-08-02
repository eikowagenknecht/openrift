import { WellKnown } from "@openrift/shared";
import type {
  ArtVariant,
  CardSize,
  CardType,
  Domain,
  Finish,
  Rarity,
  SuperType,
} from "@openrift/shared/types";
import { sql } from "kysely";
import type { Kysely, Selectable, Updateable } from "kysely";

import type { CardsTable, Database, PrintingsTable } from "../db/index.js";

/**
 * Write path for the accepted catalog: cards, printings, their junction tables
 * (domains, types, super types, name aliases), and the image-file rows a
 * printing delete has to clean up. Used by the admin card-source management
 * routes and the accept flow.
 *
 * Sibling repos own the neighbouring concerns: `candidateCardsRepo` for the
 * candidate tables, `catalogDeleteGuardsRepo` for the pre-delete blocker
 * counts, `cardErrataRepo` for errata, and `keywordsRepo` for recomputing
 * `cards.keywords`.
 *
 * @returns An object with catalog mutation methods bound to the given `db`.
 */
export function catalogMutationsRepo(db: Kysely<Database>) {
  return {
    // ── Printing lookups ──────────────────────────────────────────────────

    /** @returns A printing's differentiator fields by UUID. */
    getPrintingDifferentiatorsById(id: string) {
      return db
        .selectFrom("printings")
        .select(["id", "finish", "artVariant", "isSigned", "markerSlugs", "rarity"])
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /** @returns A printing's shortCode, finish, and language by UUID. */
    getPrintingById(
      id: string,
    ): Promise<{ id: string; shortCode: string; finish: string; language: string } | undefined> {
      return db
        .selectFrom("printings")
        .select(["id", "shortCode", "finish", "language"])
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /** @returns A full printing row by UUID (for change tracking). */
    getFullPrintingById(id: string): Promise<Selectable<PrintingsTable> | undefined> {
      return db.selectFrom("printings").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** @returns A full card row by UUID (for change tracking / audit events). */
    getFullCardById(id: string): Promise<Selectable<CardsTable> | undefined> {
      return db.selectFrom("cards").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** @returns A printing's cardId by composite key (shortCode, finish, markerSlugs, language). */
    getPrintingCardIdByComposite(
      shortCode: string,
      finish: Finish,
      markerSlugs: string[],
      language: string,
    ): Promise<{ cardId: string } | undefined> {
      const sortedSlugs = [...markerSlugs].sort();
      return db
        .selectFrom("printings")
        .select("cardId")
        .where("shortCode", "=", shortCode)
        .where("finish", "=", finish)
        .where("markerSlugs", "=", sql<string[]>`${sortedSlugs}::text[]`)
        .where("language", "=", language)
        .executeTakeFirst();
    },

    /** @returns The printed_total of the set a printing belongs to. */
    getSetPrintedTotalForPrinting(
      printingId: string,
    ): Promise<{ printedTotal: number | null } | undefined> {
      return db
        .selectFrom("printings")
        .innerJoin("sets", "sets.id", "printings.setId")
        .select("sets.printedTotal")
        .where("printings.id", "=", printingId)
        .executeTakeFirst();
    },

    /** @returns Printing UUIDs for a card by card UUID. */
    getPrintingIdsByCardId(cardId: string): Promise<{ id: string }[]> {
      return db.selectFrom("printings").select("id").where("cardId", "=", cardId).execute();
    },

    /** @returns EN printing-level rules/effect texts for a card identified by UUID. */
    getPrintingTextsForCardId(
      cardId: string,
    ): Promise<Pick<Selectable<PrintingsTable>, "printedRulesText" | "printedEffectText">[]> {
      return db
        .selectFrom("printings")
        .select(["printings.printedRulesText", "printings.printedEffectText"])
        .where("printings.cardId", "=", cardId)
        .where("printings.language", "=", WellKnown.language.EN)
        .execute();
    },

    /** @returns EN printing rules/effect texts for the given card ids. */
    getPrintingTextsByCardIds(
      cardIds: string[],
    ): Promise<
      Pick<Selectable<PrintingsTable>, "cardId" | "printedRulesText" | "printedEffectText">[]
    > {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printings")
        .select(["cardId", "printedRulesText", "printedEffectText"])
        .where("cardId", "in", cardIds)
        .where("language", "=", WellKnown.language.EN)
        .execute();
    },

    // ── Card lookups ──────────────────────────────────────────────────────

    /** @returns A card's ID and name by slug. */
    getCardBySlug(slug: string): Promise<Pick<Selectable<CardsTable>, "id" | "name"> | undefined> {
      return db
        .selectFrom("cards")
        .select(["id", "name"])
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    /** @returns A card's ID and name by UUID. */
    getCardById(
      id: string,
    ): Promise<Pick<Selectable<CardsTable>, "id" | "name" | "slug"> | undefined> {
      return db
        .selectFrom("cards")
        .select(["id", "name", "slug"])
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /** @returns A card's ID by slug. */
    getCardIdBySlug(slug: string): Promise<Pick<Selectable<CardsTable>, "id"> | undefined> {
      return db.selectFrom("cards").select("id").where("slug", "=", slug).executeTakeFirst();
    },

    /** @returns Card ids/names keyed by slug for the given slug list. */
    getCardsBySlugs(
      slugs: string[],
    ): Promise<Pick<Selectable<CardsTable>, "id" | "slug" | "name">[]> {
      if (slugs.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("cards")
        .select(["id", "slug", "name"])
        .where("slug", "in", slugs)
        .execute();
    },

    /** @returns Alias normNames for a card. */
    getCardAliases(cardId: string): Promise<{ normName: string }[]> {
      return db
        .selectFrom("cardNameAliases")
        .select("normName")
        .where("cardId", "=", cardId)
        .execute();
    },

    /** @returns Set UUID by slug. */
    getSetIdBySlug(slug: string): Promise<{ id: string } | undefined> {
      return db.selectFrom("sets").select("id").where("slug", "=", slug).executeTakeFirst();
    },

    // ── Card mutations ────────────────────────────────────────────────────

    /** Update arbitrary fields on a card by UUID. */
    async updateCardById(id: string, updates: Updateable<CardsTable>): Promise<void> {
      await db.updateTable("cards").set(updates).where("id", "=", id).execute();
    },

    /** Rename a card's slug by card UUID. */
    async renameCardSlugById(cardId: string, newSlug: string): Promise<void> {
      await db.updateTable("cards").set({ slug: newSlug }).where("id", "=", cardId).execute();
    },

    /** Replace all domains for a card by UUID (delete + insert). */
    async replaceCardDomainsById(cardId: string, domains: string[]): Promise<void> {
      await db.deleteFrom("cardDomains").where("cardId", "=", cardId).execute();
      if (domains.length > 0) {
        await db
          .insertInto("cardDomains")
          .values(
            domains.map((domain, index) => ({
              cardId,
              domainSlug: domain,
              ordinal: index,
            })),
          )
          .execute();
      }
    },

    /**
     * Replace all card types for a card by UUID (delete + insert), keeping the
     * denormalized `cards.type` scalar in sync with the first type (ADR-037).
     */
    async replaceCardTypesById(cardId: string, types: string[]): Promise<void> {
      if (types.length === 0) {
        throw new Error("A card must have at least one type");
      }
      // Delete + insert must share a transaction: the deferred constraint
      // trigger from migration 193 rejects any COMMIT that leaves a card with
      // zero junction rows, and outside a transaction each statement commits
      // on its own — the bare delete would be rejected before the insert runs.
      const run = async (trx: typeof db): Promise<void> => {
        await trx.deleteFrom("cardCardTypes").where("cardId", "=", cardId).execute();
        await trx
          .insertInto("cardCardTypes")
          .values(types.map((type, index) => ({ cardId, typeSlug: type, position: index })))
          .execute();
        await trx.updateTable("cards").set({ type: types[0] }).where("id", "=", cardId).execute();
      };
      await (db.isTransaction ? run(db) : db.transaction().execute(run));
    },

    /** Replace all super types for a card by UUID (delete + insert). */
    async replaceCardSuperTypesById(cardId: string, superTypes: string[]): Promise<void> {
      await db.deleteFrom("cardSuperTypes").where("cardId", "=", cardId).execute();
      if (superTypes.length > 0) {
        await db
          .insertInto("cardSuperTypes")
          .values(superTypes.map((superType) => ({ cardId, superTypeSlug: superType })))
          .execute();
      }
    },

    /** Delete all bans for a card by UUID. */
    async deleteCardBansByCardId(cardId: string): Promise<void> {
      await db.deleteFrom("cardBans").where("cardId", "=", cardId).execute();
    },

    /** Delete manual marketplace card overrides pointing at a card by UUID. */
    async deleteMarketplaceCardOverridesByCardId(cardId: string): Promise<void> {
      await db.deleteFrom("marketplaceProductCardOverrides").where("cardId", "=", cardId).execute();
    },

    /**
     * Delete a card by UUID.
     * @returns The deleted row's ID, or undefined if not found.
     */
    deleteCardById(id: string): Promise<{ id: string } | undefined> {
      return db.deleteFrom("cards").where("id", "=", id).returning("id").executeTakeFirst();
    },

    // ── Printing mutations ────────────────────────────────────────────────

    /** Update arbitrary fields on a printing by UUID. */
    async updatePrintingById(id: string, updates: Updateable<PrintingsTable>): Promise<void> {
      await db.updateTable("printings").set(updates).where("id", "=", id).execute();
    },

    /** Update a single field on a printing by UUID. */
    async updatePrintingFieldById(id: string, field: string, value: unknown): Promise<void> {
      await db
        .updateTable("printings")
        .set({ [field]: value })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Delete a printing by UUID.
     * @returns The deleted row's ID, or undefined if not found.
     */
    deletePrintingById(id: string): Promise<{ id: string } | undefined> {
      return db.deleteFrom("printings").where("id", "=", id).returning("id").executeTakeFirst();
    },

    /**
     * Insert or update a printing.
     * `markerSlugs` is set on the printing directly; callers are responsible for
     * syncing the `printing_markers` join afterwards (the maintenance trigger
     * keeps marker_slugs canonical once the join is populated).
     *
     * Uses a manual select-then-insert/update because the matching unique
     * constraint (`uq_printings_identity`) is DEFERRABLE INITIALLY DEFERRED
     * (migration 092) and Postgres rejects deferrable constraints as ON
     * CONFLICT arbiters.
     *
     * @returns The new or existing printing UUID.
     */
    async upsertPrinting(values: {
      cardId: string;
      setId: string;
      shortCode: string;
      rarity: Rarity;
      artVariant: ArtVariant;
      isSigned: boolean;
      markerSlugs: string[];
      finish: Finish;
      size: CardSize;
      artist: string;
      publicCode: string;
      printedRulesText: string | null;
      printedEffectText: string | null;
      flavorText: string | null;
      language: string;
      printedName: string | null;
      printedYear: number | null;
    }): Promise<string> {
      const sortedSlugs = [...values.markerSlugs].sort();
      const existing = await db
        .selectFrom("printings")
        .select("id")
        .where("cardId", "=", values.cardId)
        .where("shortCode", "=", values.shortCode)
        .where("finish", "=", values.finish)
        .where("size", "=", values.size)
        .where("markerSlugs", "=", sql<string[]>`${sortedSlugs}::text[]`)
        .where("language", "=", values.language)
        .executeTakeFirst();
      if (existing) {
        await db
          .updateTable("printings")
          .set({
            artist: values.artist,
            publicCode: values.publicCode,
            printedRulesText: values.printedRulesText,
            printedEffectText: values.printedEffectText,
            flavorText: values.flavorText,
            printedName: values.printedName,
            printedYear: values.printedYear,
          })
          .where("id", "=", existing.id)
          .execute();
        return existing.id;
      }
      const result = await db
        .insertInto("printings")
        .values({ ...values, markerSlugs: sortedSlugs })
        .returning("id")
        .executeTakeFirstOrThrow();
      return result.id;
    },

    // ── Printing image cleanup ────────────────────────────────────────────

    /**
     * Delete all printing_images for a printing UUID.
     * @returns imageFileIds for cleanup.
     */
    deletePrintingImagesByPrintingId(printingId: string): Promise<{ imageFileId: string }[]> {
      return db
        .deleteFrom("printingImages")
        .where("printingId", "=", printingId)
        .returning("imageFileId")
        .execute();
    },

    /** @returns An image_file row by ID (rehostedUrl for disk cleanup). */
    getImageFileById(
      imageFileId: string,
    ): Promise<{ id: string; rehostedUrl: string | null } | undefined> {
      return db
        .selectFrom("imageFiles")
        .select(["id", "rehostedUrl"])
        .where("id", "=", imageFileId)
        .executeTakeFirst();
    },

    /** @returns Whether any printing_images row still references the given image_file. */
    async isImageFileReferenced(imageFileId: string): Promise<boolean> {
      const result = await db
        .selectFrom("printingImages")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("imageFileId", "=", imageFileId)
        .executeTakeFirstOrThrow();
      return Number(result.count) > 0;
    },

    /** Delete an image_files row by ID. */
    async deleteImageFileById(imageFileId: string): Promise<void> {
      await db.deleteFrom("imageFiles").where("id", "=", imageFileId).execute();
    },

    // ── Accept new card from sources ──────────────────────────────────────

    /**
     * Create a new card from source data,
     * then link all candidate_cards with the given normalized name to the new card.
     * Printings are accepted separately via acceptNewPrintingFromSource.
     */
    async acceptNewCardFromSources(
      cardFields: {
        id: string;
        name: string;
        types: CardType[];
        superTypes?: SuperType[];
        domains: Domain[];
        might?: number | null;
        energy?: number | null;
        power?: number | null;
        mightBonus?: number | null;
        tags?: string[];
      },
      normalizedName: string,
    ): Promise<void> {
      if (cardFields.types.length === 0) {
        throw new Error("A card must have at least one type");
      }
      const { id: cardUuid } = await db
        .insertInto("cards")
        .values({
          slug: cardFields.id,
          name: cardFields.name,
          type: cardFields.types[0],
          might: cardFields.might ?? null,
          energy: cardFields.energy ?? null,
          power: cardFields.power ?? null,
          mightBonus: cardFields.mightBonus ?? null,
          keywords: [],
          tags: cardFields.tags ?? [],
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      // Write card types to junction table (position 0 mirrors cards.type)
      await db
        .insertInto("cardCardTypes")
        .values(
          cardFields.types.map((type, index) => ({
            cardId: cardUuid,
            typeSlug: type,
            position: index,
          })),
        )
        .execute();

      // Write domains to junction table
      if (cardFields.domains.length > 0) {
        await db
          .insertInto("cardDomains")
          .values(
            cardFields.domains.map((domain, index) => ({
              cardId: cardUuid,
              domainSlug: domain,
              ordinal: index,
            })),
          )
          .execute();
      }

      // Write super types to junction table
      const superTypes = cardFields.superTypes ?? [];
      if (superTypes.length > 0) {
        await db
          .insertInto("cardSuperTypes")
          .values(superTypes.map((superType) => ({ cardId: cardUuid, superTypeSlug: superType })))
          .execute();
      }

      await db
        .insertInto("cardNameAliases")
        .values({ normName: normalizedName, cardId: cardUuid })
        .onConflict((oc) => oc.column("normName").doUpdateSet({ cardId: cardUuid }))
        .execute();
    },

    /**
     * Create name aliases for every distinct spelling of the normalized name,
     * so that resolveCardId() can match candidate_cards to this card dynamically.
     */
    async createNameAliases(normalizedName: string, cardId: string): Promise<void> {
      await db
        .insertInto("cardNameAliases")
        .values({ normName: normalizedName, cardId })
        .onConflict((oc) => oc.column("normName").doUpdateSet({ cardId }))
        .execute();
    },

    /**
     * Keep a card's self-alias in sync after a display-name change. The
     * `cards_set_norm_name` trigger rewrites `cards.norm_name` on every name
     * update, but nothing else maintains `card_name_aliases` — so without this a
     * rename strands the old-name self-alias and never creates the new one,
     * desyncing the card-detail view (matches by aliases) from the list view
     * (matches by `cards.norm_name`). Adds the new normalized name as an alias
     * and drops the previous self-alias, leaving no stale old-name row behind.
     * Hand-added alt-spelling aliases are untouched (only the old self-alias is
     * removed). No-ops when the normalized name is unchanged.
     */
    async syncSelfAliasOnRename(
      cardId: string,
      oldNormName: string,
      newNormName: string,
    ): Promise<void> {
      if (oldNormName === newNormName) {
        return;
      }
      await db
        .insertInto("cardNameAliases")
        .values({ normName: newNormName, cardId })
        .onConflict((oc) => oc.column("normName").doUpdateSet({ cardId }))
        .execute();
      await db
        .deleteFrom("cardNameAliases")
        .where("cardId", "=", cardId)
        .where("normName", "=", oldNormName)
        .execute();
    },
  };
}
