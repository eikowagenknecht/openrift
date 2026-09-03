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
 * The field set the `uq_printings_identity` unique constraint covers — the key
 * `upsertPrinting` matches an existing row on. `findPrintingIdByIdentity` and
 * the upsert share it so a caller checking "does this already exist?" cannot
 * drift from what the upsert actually treats as the same printing.
 */
export interface PrintingIdentity {
  cardId: string;
  shortCode: string;
  finish: Finish;
  size: CardSize;
  markerSlugs: string[];
  language: string;
}

export function catalogMutationsRepo(db: Kysely<Database>) {
  function findPrintingIdByIdentity(
    identity: PrintingIdentity,
  ): Promise<{ id: string } | undefined> {
    return db
      .selectFrom("printings")
      .select("id")
      .where("cardId", "=", identity.cardId)
      .where("shortCode", "=", identity.shortCode)
      .where("finish", "=", identity.finish)
      .where("size", "=", identity.size)
      .where("markerSlugs", "=", sql<string[]>`${[...identity.markerSlugs].sort()}::text[]`)
      .where("language", "=", identity.language)
      .executeTakeFirst();
  }

  return {
    findPrintingIdByIdentity,

    getPrintingDifferentiatorsById(id: string) {
      return db
        .selectFrom("printings")
        .select([
          "id",
          "finish",
          "artVariant",
          "isSigned",
          "isOvernumbered",
          "markerSlugs",
          "rarity",
        ])
        .where("id", "=", id)
        .executeTakeFirst();
    },

    getPrintingById(
      id: string,
    ): Promise<{ id: string; shortCode: string; finish: string; language: string } | undefined> {
      return db
        .selectFrom("printings")
        .select(["id", "shortCode", "finish", "language"])
        .where("id", "=", id)
        .executeTakeFirst();
    },

    getFullPrintingById(id: string): Promise<Selectable<PrintingsTable> | undefined> {
      return db.selectFrom("printings").selectAll().where("id", "=", id).executeTakeFirst();
    },

    getFullCardById(id: string): Promise<Selectable<CardsTable> | undefined> {
      return db.selectFrom("cards").selectAll().where("id", "=", id).executeTakeFirst();
    },

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

    getPrintingIdsByCardId(cardId: string): Promise<{ id: string }[]> {
      return db.selectFrom("printings").select("id").where("cardId", "=", cardId).execute();
    },

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

    getCardBySlug(slug: string): Promise<Pick<Selectable<CardsTable>, "id" | "name"> | undefined> {
      return db
        .selectFrom("cards")
        .select(["id", "name"])
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    getCardById(
      id: string,
    ): Promise<Pick<Selectable<CardsTable>, "id" | "name" | "slug"> | undefined> {
      return db
        .selectFrom("cards")
        .select(["id", "name", "slug"])
        .where("id", "=", id)
        .executeTakeFirst();
    },

    getCardIdBySlug(slug: string): Promise<Pick<Selectable<CardsTable>, "id"> | undefined> {
      return db.selectFrom("cards").select("id").where("slug", "=", slug).executeTakeFirst();
    },

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

    getCardAliases(cardId: string): Promise<{ normName: string }[]> {
      return db
        .selectFrom("cardNameAliases")
        .select("normName")
        .where("cardId", "=", cardId)
        .execute();
    },

    getSetIdBySlug(slug: string): Promise<{ id: string } | undefined> {
      return db.selectFrom("sets").select("id").where("slug", "=", slug).executeTakeFirst();
    },

    async updateCardById(id: string, updates: Updateable<CardsTable>): Promise<void> {
      await db.updateTable("cards").set(updates).where("id", "=", id).execute();
    },

    async renameCardSlugById(cardId: string, newSlug: string): Promise<void> {
      await db.updateTable("cards").set({ slug: newSlug }).where("id", "=", cardId).execute();
    },

    async replaceCardDomainsById(cardId: string, domains: string[]): Promise<void> {
      // Delete + insert must share a transaction: outside one, each statement
      // commits alone, so an insert refused by the FK (an unknown slug the
      // validator let through) would leave the delete committed and the card
      // stripped of all its domains.
      const run = async (trx: typeof db): Promise<void> => {
        await trx.deleteFrom("cardDomains").where("cardId", "=", cardId).execute();
        if (domains.length > 0) {
          await trx
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
      };
      await (db.isTransaction ? run(db) : db.transaction().execute(run));
    },

    /**
     * Replaces a card's types, keeping the denormalized `cards.type` scalar in
     * sync with the first type.
     */
    async replaceCardTypesById(cardId: string, types: string[]): Promise<void> {
      if (types.length === 0) {
        throw new Error("A card must have at least one type");
      }
      // Delete + insert must share a transaction: a deferred constraint
      // trigger rejects any COMMIT that leaves a card with zero junction rows,
      // and outside a transaction each statement commits on its own — the bare
      // delete would be rejected before the insert runs.
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

    async replaceCardSuperTypesById(cardId: string, superTypes: string[]): Promise<void> {
      // Same transactional pairing as replaceCardDomainsById above.
      const run = async (trx: typeof db): Promise<void> => {
        await trx.deleteFrom("cardSuperTypes").where("cardId", "=", cardId).execute();
        if (superTypes.length > 0) {
          await trx
            .insertInto("cardSuperTypes")
            .values(superTypes.map((superType) => ({ cardId, superTypeSlug: superType })))
            .execute();
        }
      };
      await (db.isTransaction ? run(db) : db.transaction().execute(run));
    },

    async deleteCardBansByCardId(cardId: string): Promise<void> {
      await db.deleteFrom("cardBans").where("cardId", "=", cardId).execute();
    },

    async deleteMarketplaceCardOverridesByCardId(cardId: string): Promise<void> {
      await db.deleteFrom("marketplaceProductCardOverrides").where("cardId", "=", cardId).execute();
    },

    deleteCardById(id: string): Promise<{ id: string } | undefined> {
      return db.deleteFrom("cards").where("id", "=", id).returning("id").executeTakeFirst();
    },

    async updatePrintingById(id: string, updates: Updateable<PrintingsTable>): Promise<void> {
      await db.updateTable("printings").set(updates).where("id", "=", id).execute();
    },

    /**
     * `field` is constrained to a real column so a caller's field allowlist is
     * checked against `printings` at compile time; `value` stays `unknown`
     * because callers validate it per-field against the shared field rules.
     */
    async updatePrintingFieldById(
      id: string,
      field: keyof Updateable<PrintingsTable> & string,
      value: unknown,
    ): Promise<void> {
      await db
        .updateTable("printings")
        .set({ [field]: value })
        .where("id", "=", id)
        .execute();
    },

    deletePrintingById(id: string): Promise<{ id: string } | undefined> {
      return db.deleteFrom("printings").where("id", "=", id).returning("id").executeTakeFirst();
    },

    /**
     * `markerSlugs` is set on the printing directly; callers are responsible
     * for syncing the `printing_markers` join afterwards (the maintenance
     * trigger keeps marker_slugs canonical once the join is populated).
     *
     * Manual select-then-insert/update because the matching unique constraint
     * (`uq_printings_identity`) is DEFERRABLE INITIALLY DEFERRED and Postgres
     * rejects deferrable constraints as ON CONFLICT arbiters.
     */
    async upsertPrinting(values: {
      cardId: string;
      setId: string;
      shortCode: string;
      rarity: Rarity;
      artVariant: ArtVariant;
      isSigned: boolean;
      isOvernumbered: boolean;
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
      const existing = await findPrintingIdByIdentity(values);
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

    deletePrintingImagesByPrintingId(printingId: string): Promise<{ imageFileId: string }[]> {
      return db
        .deleteFrom("printingImages")
        .where("printingId", "=", printingId)
        .returning("imageFileId")
        .execute();
    },

    getImageFileById(
      imageFileId: string,
    ): Promise<{ id: string; rehostedUrl: string | null } | undefined> {
      return db
        .selectFrom("imageFiles")
        .select(["id", "rehostedUrl"])
        .where("id", "=", imageFileId)
        .executeTakeFirst();
    },

    async isImageFileReferenced(imageFileId: string): Promise<boolean> {
      // Both kinds of reference count. A file can be a printing's own scan, or
      // the substitute art another printing pins — most often both at once,
      // since the usual pin is a sibling's scan. Missing the pin
      // here would let the orphan sweep delete a file that is still on screen,
      // and the FK is ON DELETE RESTRICT, so it would fail loudly rather than
      // silently. The pin lookup is a partial-index hit and only runs for a
      // file no printing image claims, which is the rare case.
      const result = await db
        .selectFrom("printingImages")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("imageFileId", "=", imageFileId)
        .executeTakeFirstOrThrow();
      if (Number(result.count) > 0) {
        return true;
      }
      const pin = await db
        .selectFrom("printings")
        .select("id")
        .where("fallbackImageFileId", "=", imageFileId)
        .limit(1)
        .executeTakeFirst();
      return pin !== undefined;
    },

    async deleteImageFileById(imageFileId: string): Promise<void> {
      await db.deleteFrom("imageFiles").where("id", "=", imageFileId).execute();
    },

    /**
     * Creates a card from source data and links every candidate_cards row with
     * the given normalized name to it. Printings are accepted separately via
     * acceptNewPrintingFromSource.
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

      // Position 0 mirrors cards.type.
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
     * Records the alias so `resolveCardIdByName` can match a candidate card
     * with this normalized name to the card.
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
     * update, but nothing else maintains `card_name_aliases` — so without this
     * a rename strands the old-name self-alias and never creates the new one,
     * desyncing the card-detail view (matches by aliases) from the list view
     * (matches by `cards.norm_name`). Hand-added alt-spelling aliases are
     * untouched (only the old self-alias is removed). No-ops when the
     * normalized name is unchanged.
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
