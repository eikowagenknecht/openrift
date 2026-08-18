import type { Marketplace } from "@openrift/shared";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import { imageUrlWithOriginal, joinFrontImage } from "./query-helpers.js";

type Db = Kysely<Database>;

/**
 * Queries for the marketplace mapping workflow (mapping external products
 * to internal printings).
 *
 * @returns An object with marketplace-mapping query methods bound to the given `db`.
 */
export function marketplaceMappingRepo(db: Db) {
  return {
    /** @returns Level-2 ignored products (whole upstream listings) for a marketplace. */
    ignoredProducts(marketplace: Marketplace) {
      return db
        .selectFrom("marketplaceIgnoredProducts")
        .select(["externalId", "productName", "createdAt"])
        .where("marketplace", "=", marketplace)
        .execute();
    },

    /** @returns Level-3 ignored variants (specific SKUs of an upstream product) for a marketplace. */
    ignoredVariants(marketplace: Marketplace) {
      return db
        .selectFrom("marketplaceIgnoredVariants as iv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "iv.marketplaceProductId")
        .select([
          "mp.externalId as externalId",
          "mp.finish as finish",
          "mp.language as language",
          "iv.productName as productName",
          "iv.createdAt as createdAt",
        ])
        .where("mp.marketplace", "=", marketplace)
        .execute();
    },

    /**
     * Latest price row per (printingId, externalId, finish, language) for
     * mapped printings in a given marketplace. The SKU key on
     * `marketplace_products` is `(marketplace, external_id, finish, language)`
     * — one externalId can resolve to multiple SKUs (e.g. CM's normal/foil
     * variants), and each one has its own price history, so the result key has
     * to carry the full SKU tuple. Because that key is UNIQUE per marketplace
     * (`marketplace_products_sku_key`) and `(marketplaceProductId, printingId)`
     * is UNIQUE on the variants table, one row per (variant, product) pair is
     * exactly one row per SKU tuple.
     *
     * `marketplace_product_prices` is a history table keyed
     * `(marketplaceProductId, recordedAt)`. Joining it wholesale and reducing
     * with DISTINCT ON made Postgres sort every historical row for every
     * matched product just to keep the newest of each group, so the cost grew
     * with retained history (~830ms per marketplace in prod). The lateral
     * picks the newest row per product straight off that primary key instead,
     * so only one price row per product is ever read.
     * @returns One row per distinct (printingId, externalId, finish, language), each carrying that SKU's newest price.
     */
    pricesByMarketplace(marketplace: Marketplace, printingIds: string[]) {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .innerJoinLateral(
          (eb) =>
            eb
              .selectFrom("marketplaceProductPrices as p")
              .select([
                "p.marketCents",
                "p.lowCents",
                "p.midCents",
                "p.highCents",
                "p.trendCents",
                "p.avg1Cents",
                "p.avg7Cents",
                "p.avg30Cents",
                "p.recordedAt",
              ])
              .whereRef("p.marketplaceProductId", "=", "mp.id")
              .orderBy("p.recordedAt", "desc")
              .limit(1)
              .as("pp"),
          (join) => join.onTrue(),
        )
        .select([
          "mpv.printingId as printingId",
          "mp.externalId as externalId",
          "mp.productName as productName",
          "mp.finish as finish",
          "mp.language as language",
          "pp.marketCents",
          "pp.lowCents",
          "pp.midCents",
          "pp.highCents",
          "pp.trendCents",
          "pp.avg1Cents",
          "pp.avg7Cents",
          "pp.avg30Cents",
          "pp.recordedAt",
        ])
        .where("mp.marketplace", "=", marketplace)
        .where("mpv.printingId", "in", printingIds)
        .orderBy("mpv.printingId")
        .orderBy("mp.externalId")
        .orderBy("mp.finish")
        .orderBy("mp.language")
        .execute();
    },

    /**
     * Latest known price per *unbound* SKU for a marketplace — the admin's
     * "unmatched products" feed. Reads from `marketplace_products` joined to
     * the latest `marketplace_product_prices` row per product, excluding
     * products that already have at least one variant binding (those products
     * already belong to a card and aren't candidates for fresh suggestions).
     * @returns One row per unbound SKU with the latest recorded prices. `language`
     *          is `null` on the marketplaces that don't split SKUs by language,
     *          which is the normal case for cardmarket and tcgplayer.
     */
    allStaging(marketplace: Marketplace) {
      return db
        .selectFrom("marketplaceProducts as mp")
        .innerJoinLateral(
          (eb) =>
            eb
              .selectFrom("marketplaceProductPrices as p")
              .select([
                "p.recordedAt",
                "p.marketCents",
                "p.lowCents",
                "p.midCents",
                "p.highCents",
                "p.trendCents",
                "p.avg1Cents",
                "p.avg7Cents",
                "p.avg30Cents",
              ])
              .whereRef("p.marketplaceProductId", "=", "mp.id")
              .orderBy("p.recordedAt", "desc")
              .limit(1)
              .as("latest"),
          (join) => join.onTrue(),
        )
        .select([
          "mp.marketplace as marketplace",
          "mp.externalId as externalId",
          "mp.groupId as groupId",
          "mp.productName as productName",
          "mp.finish as finish",
          "mp.language as language",
          "latest.recordedAt",
          "latest.marketCents",
          "latest.lowCents",
          "latest.midCents",
          "latest.highCents",
          "latest.trendCents",
          "latest.avg1Cents",
          "latest.avg7Cents",
          "latest.avg30Cents",
        ])
        .where("mp.marketplace", "=", marketplace)
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("marketplaceProductVariants as mpv")
                .select("mpv.id")
                .whereRef("mpv.marketplaceProductId", "=", "mp.id"),
            ),
          ),
        )
        .execute();
    },

    /** @returns Group display names, kind, and assigned-set slug for a marketplace. */
    groupNames(marketplace: Marketplace) {
      return db
        .selectFrom("marketplaceGroups as mg")
        .leftJoin("sets as s", "s.id", "mg.setId")
        .select([
          "mg.groupId as gid",
          "mg.name as name",
          "mg.groupKind as groupKind",
          "s.slug as setSlug",
        ])
        .where("mg.marketplace", "=", marketplace)
        .execute();
    },

    /** @returns All cards with their printings, sets, marketplace variant mappings, and images. */
    allCardsWithPrintings(marketplace: Marketplace) {
      return (
        joinFrontImage(
          db
            .selectFrom("cards as c")
            .innerJoin("printings as p", "p.cardId", "c.id")
            .innerJoin("sets as s", "s.id", "p.setId")
            .innerJoin("mvCardAggregates as mca", "mca.cardId", "c.id")
            .leftJoin("marketplaceProductVariants as mpv", "mpv.printingId", "p.id")
            .leftJoin("marketplaceProducts as mp", (join) =>
              join
                .onRef("mp.id", "=", "mpv.marketplaceProductId")
                .on("mp.marketplace", "=", marketplace),
            ),
        )
          .select([
            "c.id as cardId",
            "c.slug as cardSlug",
            "c.name as cardName",
            "mca.domains",
            "mca.superTypes",
            "c.energy",
            "c.might",
            "p.id as printingId",
            "s.slug as setId",
            "p.shortCode",
            "p.rarity",
            "s.name as setName",
            "p.artVariant",
            "p.isSigned",
            "p.markerSlugs",
            "p.finish",
            "p.size",
            "p.language",
            imageUrlWithOriginal("imgf").as("imageUrl"),
            "mp.externalId as externalId",
            "mp.groupId as sourceGroupId",
            "mp.language as sourceLanguage",
            "mp.finish as productFinish",
          ])
          // A printing can have variants for multiple marketplaces. The variant join
          // returns one row per variant, but the product join filters by marketplace,
          // so variants from other marketplaces appear as null product rows. Drop
          // those here — keep only (a) printings with no variant at all, or (b) rows
          // where the variant's parent product matched the requested marketplace.
          .where((eb) => eb.or([eb("mpv.id", "is", null), eb("mp.id", "is not", null)]))
          .orderBy("s.slug")
          .orderBy("c.name")
          .orderBy("p.shortCode")
          .orderBy("p.finish", "desc")
          // Tiebreak on language then id so EN consistently lands before SC
          // (and printings stay in a stable order across refetches). Without
          // this the suggestion algorithm picked an arbitrary language when
          // two printings tied on score.
          .orderBy("p.language")
          .orderBy("p.id")
          .execute()
      );
    },

    /**
     * Like `allCardsWithPrintings` but returns variant rows for every marketplace
     * in a single query. Lets the unified mapping endpoint fetch the heavy
     * cards × printings × images joins once instead of three times. The caller
     * must filter rows down to the per-marketplace shape (see deriveCardsForMarketplace).
     *
     * Pass `cardIdentifier` (UUID or slug) to scope the query to one card —
     * used by the card-detail admin page which only needs mappings for the
     * card it's viewing. Accepting either form means callers don't have to
     * serialize a slug → id lookup before this query.
     * @returns One row per (printing × variant), plus one row per printing with no variant in any marketplace.
     */
    allCardsWithPrintingsUnified(cardIdentifier?: string) {
      let query = joinFrontImage(
        db
          .selectFrom("cards as c")
          .innerJoin("printings as p", "p.cardId", "c.id")
          .innerJoin("sets as s", "s.id", "p.setId")
          .innerJoin("mvCardAggregates as mca", "mca.cardId", "c.id")
          .leftJoin("marketplaceProductVariants as mpv", "mpv.printingId", "p.id")
          .leftJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
          .leftJoin("marketplaceGroups as mg", (join) =>
            join
              .onRef("mg.marketplace", "=", "mp.marketplace")
              .onRef("mg.groupId", "=", "mp.groupId"),
          )
          .leftJoin("sets as gs", "gs.id", "mg.setId"),
      ).select([
        "c.id as cardId",
        "c.slug as cardSlug",
        "c.name as cardName",
        "mca.domains",
        "mca.superTypes",
        "c.energy",
        "c.might",
        "p.id as printingId",
        "s.slug as setId",
        "p.shortCode",
        "p.rarity",
        "s.name as setName",
        "p.artVariant",
        "p.isSigned",
        "p.markerSlugs",
        "p.finish",
        "p.size",
        "p.language",
        imageUrlWithOriginal("imgf").as("imageUrl"),
        "mp.marketplace as variantMarketplace",
        "mp.externalId as externalId",
        "mp.groupId as sourceGroupId",
        "mg.name as sourceGroupName",
        "mg.groupKind as sourceGroupKind",
        "gs.slug as sourceGroupSetSlug",
        "mp.language as sourceLanguage",
        "mp.finish as productFinish",
      ]);
      if (cardIdentifier !== undefined) {
        query = query.where((eb) =>
          eb.or([
            eb(sql<string>`c.id::text`, "=", cardIdentifier),
            eb("c.slug", "=", cardIdentifier),
          ]),
        );
      }
      return (
        query
          .orderBy("s.slug")
          .orderBy("c.name")
          .orderBy("p.shortCode")
          .orderBy("p.finish", "desc")
          // Same tiebreakers as `allCardsWithPrintings` — keep printings in a
          // stable EN-before-SC order so suggestion ranking is deterministic.
          .orderBy("p.language")
          .orderBy("p.id")
          .execute()
      );
    },

    /**
     * Lightweight card+printings list for the "assign to card" dropdown in the
     * admin marketplace UI. Returns every card with its display metadata and
     * the set of short codes across its printings — enough for the dropdown
     * without pulling the full cards × printings × images × variants join.
     * @returns One entry per card, with its short codes aggregated.
     */
    async assignableCards() {
      const result = await sql<{
        cardId: string;
        cardSlug: string;
        cardName: string;
        setName: string;
        shortCodes: string[];
      }>`
        SELECT
          c.id as "cardId",
          c.slug as "cardSlug",
          c.name as "cardName",
          s.name as "setName",
          COALESCE(array_agg(p.short_code ORDER BY p.short_code) FILTER (WHERE p.short_code IS NOT NULL), ARRAY[]::text[]) as "shortCodes"
        FROM cards c
        INNER JOIN printings p ON p.card_id = c.id
        INNER JOIN sets s ON s.id = p.set_id
        GROUP BY c.id, c.slug, c.name, s.name
      `.execute(db);
      return result.rows;
    },

    /** @returns Manual card overrides for a marketplace, with the override's SKU axes inlined. */
    async stagingCardOverrides(marketplace: Marketplace) {
      const rows = await db
        .selectFrom("marketplaceProductCardOverrides as ov")
        .innerJoin("marketplaceProducts as mp", "mp.id", "ov.marketplaceProductId")
        .select([
          "mp.externalId as externalId",
          "mp.finish as finish",
          "mp.language as language",
          "ov.cardId as cardId",
        ])
        .where("mp.marketplace", "=", marketplace)
        .execute();
      return rows;
    },

    // ── saveMappings queries ────────────────────────────────────────────────

    /** @returns Printing finishes and languages by IDs. */
    printingFinishesAndLanguages(printingIds: string[]) {
      return db
        .selectFrom("printings")
        .select(["id", "finish", "language"])
        .where("id", "in", printingIds)
        .execute();
    },

    /**
     * Fetch already-upserted product rows by external ID. Used by `saveMappings`
     * to rebind a variant to a different printing when staging has rotated out
     * but the upstream product record is still present — reuses the existing
     * `group_id` and `product_name` as a fallback so the upsert can proceed.
     * @returns One row per SKU (external_id × finish × language) with its
     *          display name and group ID.
     */
    productsByExternalIds(marketplace: Marketplace, externalIds: number[]) {
      if (externalIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("marketplaceProducts")
        .select(["externalId", "finish", "language", "productName", "groupId"])
        .where("marketplace", "=", marketplace)
        .where("externalId", "in", externalIds)
        .execute();
    },

    /**
     * Batch-upsert marketplace products and their variants.
     *
     * For each input row: upserts the per-SKU product (keyed on
     * `(marketplace, external_id, finish, language)` — NULLS NOT DISTINCT so
     * CM/TCG collapse on NULL language) then upserts the variant (keyed on
     * `(marketplace_product_id, printing_id)`). One product SKU can map to
     * multiple printings — e.g. Cardmarket's language-aggregate product row
     * legitimately covers every language of the same card.
     *
     * @returns One row per input, each with its `(printingId, externalId,
     *          finish, language)` key and the resulting `variantId`.
     */
    async upsertProductVariants(
      values: {
        marketplace: Marketplace;
        printingId: string;
        externalId: number;
        groupId: number;
        productName: string;
        finish: string;
        /** `null` for marketplaces that don't expose language as a SKU axis (CM/TCG). */
        language: string | null;
      }[],
    ): Promise<
      {
        printingId: string;
        externalId: number;
        finish: string;
        language: string | null;
        variantId: string;
      }[]
    > {
      if (values.length === 0) {
        return [];
      }

      // Dedupe on the product unique key `(marketplace, external_id, finish,
      // language)`. A single batch can legitimately carry multiple variants
      // of the same product — e.g. batch-accepting a language-aggregate
      // suggestion fires one mapping per sibling printing, all pointing at
      // the same marketplace product. Without this dedupe, Postgres raises
      // "ON CONFLICT DO UPDATE command cannot affect row a second time" and
      // the whole batch fails.
      const productRowsByKey = new Map<
        string,
        {
          marketplace: Marketplace;
          externalId: number;
          groupId: number;
          productName: string;
          finish: string;
          language: string | null;
        }
      >();
      for (const v of values) {
        const key = `${v.marketplace}::${v.externalId}::${v.finish}::${v.language ?? ""}`;
        if (!productRowsByKey.has(key)) {
          productRowsByKey.set(key, {
            marketplace: v.marketplace,
            externalId: v.externalId,
            groupId: v.groupId,
            productName: v.productName,
            finish: v.finish,
            language: v.language,
          });
        }
      }
      const productRows = [...productRowsByKey.values()];

      // `doUpdateSet` rather than `doNothing`: the mapping needs an id for
      // every input SKU, and RETURNING only covers a conflicting row when the
      // conflict action actually touches it. The column list infers
      // `marketplace_products_sku_key`, which is NULLS NOT DISTINCT, so CM/TCG
      // rows with a NULL language collapse onto the existing row.
      const products = await db
        .insertInto("marketplaceProducts")
        .values(productRows)
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish", "language"]).doUpdateSet({
            groupId: (eb) => eb.ref("excluded.groupId"),
            productName: (eb) => eb.ref("excluded.productName"),
          }),
        )
        .returning(["id", "marketplace", "externalId", "finish", "language"])
        .execute();

      const productIdByKey = new Map(
        products.map((p) => [
          `${p.marketplace}::${p.externalId}::${p.finish}::${p.language ?? ""}`,
          p.id,
        ]),
      );

      const variantRows = values.map((v) => {
        const productId = productIdByKey.get(
          `${v.marketplace}::${v.externalId}::${v.finish}::${v.language ?? ""}`,
        );
        if (!productId) {
          throw new Error(
            `upsertProductVariants: missing product id for ${v.marketplace} ${v.externalId} ${v.finish}/${v.language ?? "NULL"}`,
          );
        }
        return {
          marketplaceProductId: productId,
          printingId: v.printingId,
        };
      });

      const variants = await db
        .insertInto("marketplaceProductVariants")
        .values(variantRows)
        .onConflict((oc) =>
          oc.columns(["marketplaceProductId", "printingId"]).doUpdateSet({
            // Touch a no-op so RETURNING yields the row on both insert and conflict.
            updatedAt: sql<Date>`now()`,
          }),
        )
        .returning(["id", "marketplaceProductId", "printingId"])
        .execute();

      const productKeyByProductId = new Map(products.map((p) => [p.id, p]));

      return variants.map((v) => {
        const p = productKeyByProductId.get(v.marketplaceProductId);
        if (!p) {
          throw new Error(
            `upsertProductVariants: missing product for variant ${v.id} (product ${v.marketplaceProductId})`,
          );
        }
        return {
          printingId: v.printingId,
          externalId: p.externalId,
          finish: p.finish,
          language: p.language,
          variantId: v.id,
        };
      });
    },

    // ── unmapPrinting queries ───────────────────────────────────────────────

    /**
     * @returns The variant mapping for a (printing, product SKU) pair in a
     *          given marketplace, with the parent product's SKU axes and
     *          metadata inlined. Filtered by the full SKU tuple
     *          `(externalId, finish, language)` because CardTrader fans one
     *          blueprint id out across multiple `(finish, language)` rows in
     *          `marketplace_products`, and admins routinely bind several of
     *          those rows to the same printing. Without finish/language the
     *          lookup is ambiguous and `executeTakeFirst()` would silently
     *          delete the wrong variant.
     */
    getVariantForPrinting(
      marketplace: Marketplace,
      printingId: string,
      externalId: number,
      finish: string,
      language: string | null,
    ) {
      let query = db
        .selectFrom("marketplaceProductVariants as mpv")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select([
          "mpv.id as variantId",
          "mpv.marketplaceProductId as marketplaceProductId",
          "mp.finish as finish",
          "mp.language as language",
          "mp.externalId as externalId",
          "mp.groupId as groupId",
          "mp.productName as productName",
          "mp.marketplace as marketplace",
        ])
        .where("mp.marketplace", "=", marketplace)
        .where("mpv.printingId", "=", printingId)
        .where("mp.externalId", "=", externalId)
        .where("mp.finish", "=", finish);
      query =
        language === null
          ? query.where("mp.language", "is", null)
          : query.where("mp.language", "=", language);
      return query.executeTakeFirst();
    },

    /** @returns A printing's finish and language by ID. */
    getPrintingFinishAndLanguage(printingId: string) {
      return db
        .selectFrom("printings")
        .select(["finish", "language"])
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
    },

    /**
     * Delete a marketplace variant by ID. The parent product row + its price
     * history are left in place — they represent a known upstream SKU and
     * survive unmap, so a later rebind inherits full history without the
     * product being recreated.
     */
    async deleteVariantById(id: string): Promise<void> {
      await db.deleteFrom("marketplaceProductVariants").where("id", "=", id).execute();
    },

    // ── per-card detail queries ─────────────────────────────────────────────

    /**
     * Variants visible to each printing of a card. Each printing sees exactly
     * the variants whose `printing_id` equals its own — language-aggregate
     * fan-out is materialised as explicit variant rows (see migration 107),
     * so the old source/target sibling self-join is gone.
     *
     * `ownerLanguage` equals the printing's own language now; callers that
     * used to distinguish owner vs inherited by comparing it against the
     * target printing's language treat every row as "owned."
     *
     * @returns One row per (printing, variant) for every printing of the card.
     */
    variantsForCard(cardId: string): Promise<
      {
        targetPrintingId: string;
        marketplace: Marketplace;
        externalId: number;
        productName: string;
        finish: string;
        variantLanguage: string | null;
        ownerPrintingId: string;
        ownerLanguage: string;
      }[]
    > {
      return db
        .selectFrom("printings as p")
        .innerJoin("marketplaceProductVariants as mpv", "mpv.printingId", "p.id")
        .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
        .select([
          "p.id as targetPrintingId",
          "mp.marketplace as marketplace",
          "mp.externalId as externalId",
          "mp.productName as productName",
          "mp.finish as finish",
          "mp.language as variantLanguage",
          "p.id as ownerPrintingId",
          "p.language as ownerLanguage",
        ])
        .where("p.cardId", "=", cardId)
        .execute();
    },

    /**
     * Every card alias as (cardId, normName). Used by the scoped card-detail
     * endpoint to do the longest-alias tiebreak in JS. Returned rows include
     * both the auto-seeded card-name alias and any manually-added aliases
     * (e.g. reprints, renamed cards) — 383 of ~1150 rows differ from the
     * card's name at time of writing, so the cheaper "use cardName only"
     * shortcut would misroute products.
     * @returns One row per (cardId, normName) across every card.
     */
    allCardAliases() {
      return db
        .selectFrom("cardNameAliases")
        .select(["cardId", "normName"])
        .where("normName", "<>", "")
        .execute();
    },

    /**
     * Staging rows across the given marketplaces that could belong to one
     * card, via manual override OR a normalized-name prefix/substring match
     * against the card's aliases. Used by the scoped card-detail endpoint so
     * it doesn't have to fetch every marketplace's full staging set.
     *
     * Does **not** perform the longest-alias tiebreak — returns every
     * name-match candidate and lets the caller drop rows whose longest
     * matching alias belongs to another card. The tiebreak as a SQL NOT EXISTS
     * anti-join measured ~10× slower on real data (nested loop over every
     * card's aliases per candidate row) than returning the small candidate set
     * and filtering in JS with an in-memory alias index.
     *
     * `cardIdentifier` can be UUID or slug — resolved inside the query so the
     * caller doesn't need a separate lookup. Ignored products (level 2) and
     * ignored variants (level 3) are filtered out. Each (marketplace,
     * external_id, finish, language) tuple is deduplicated to its most-recent
     * staging snapshot. `isOverride` is true when a manual override points at
     * this card for the given tuple.
     *
     * Uses the GIN trigram index on marketplace_products.norm_name
     * (migration 112) to keep the LIKE filters index-backed.
     *
     * @returns One row per unique staged SKU that could be assigned to the card, across the requested marketplaces.
     */
    async stagingForCardAcrossMarketplaces(cardIdentifier: string, marketplaces: Marketplace[]) {
      if (marketplaces.length === 0) {
        return [];
      }
      const result = await sql<{
        marketplace: Marketplace;
        externalId: number;
        productName: string;
        finish: string;
        /** `null` on the marketplaces that don't split SKUs by language (CM/TCG). */
        language: string | null;
        groupId: number;
        groupName: string | null;
        groupKind: "basic" | "special";
        groupSetSlug: string | null;
        marketCents: number | null;
        lowCents: number | null;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
        recordedAt: Date;
        isOverride: boolean;
      }>`
        WITH target_card AS (
          SELECT id FROM cards WHERE id::text = ${cardIdentifier} OR slug = ${cardIdentifier} LIMIT 1
        ),
        target_aliases AS (
          SELECT cna.norm_name
          FROM card_name_aliases cna
          JOIN target_card tc ON cna.card_id = tc.id
          WHERE cna.norm_name <> ''
        ),
        -- Candidate product IDs. Three branches UNIONed so the planner can use
        -- the GIN trigram index on marketplace_products.norm_name for the LIKE
        -- filters. The prefix/substring matches may include rows that actually
        -- belong to a different card whose alias is longer (e.g. alias
        -- blastcone prefix-matches blastconefae product) — the caller does
        -- that tiebreak in JS where it is cheap against 1k aliases.
        candidate_ids AS (
          SELECT mp.id
          FROM marketplace_products mp
          JOIN marketplace_product_card_overrides ov ON ov.marketplace_product_id = mp.id
          JOIN target_card tc ON ov.card_id = tc.id
          WHERE mp.marketplace = ANY(${marketplaces}::text[])
          UNION
          SELECT mp.id
          FROM marketplace_products mp, target_aliases a
          WHERE mp.marketplace = ANY(${marketplaces}::text[])
            AND mp.norm_name LIKE a.norm_name || '%'
          UNION
          SELECT mp.id
          FROM marketplace_products mp, target_aliases a
          WHERE mp.marketplace = ANY(${marketplaces}::text[])
            AND length(a.norm_name) >= 5
            AND mp.norm_name LIKE '%' || a.norm_name || '%'
        ),
        matched AS (
          SELECT
            mp.id,
            mp.marketplace,
            mp.external_id,
            mp.product_name,
            mp.finish,
            mp.language,
            mp.group_id,
            latest.market_cents,
            latest.low_cents,
            latest.mid_cents,
            latest.high_cents,
            latest.trend_cents,
            latest.avg1_cents,
            latest.avg7_cents,
            latest.avg30_cents,
            latest.recorded_at
          FROM marketplace_products mp
          INNER JOIN LATERAL (
            SELECT *
            FROM marketplace_product_prices pp
            WHERE pp.marketplace_product_id = mp.id
            ORDER BY pp.recorded_at DESC
            LIMIT 1
          ) latest ON true
          WHERE mp.id IN (SELECT id FROM candidate_ids)
            AND NOT EXISTS (
              SELECT 1 FROM marketplace_ignored_products ip
              WHERE ip.marketplace = mp.marketplace AND ip.external_id = mp.external_id
            )
            AND NOT EXISTS (
              SELECT 1 FROM marketplace_ignored_variants iv
              WHERE iv.marketplace_product_id = mp.id
            )
            -- Already-bound products aren't candidates for new suggestions.
            -- Matches today's behaviour where saveMappings deletes the staging
            -- row on assign.
            AND NOT EXISTS (
              SELECT 1 FROM marketplace_product_variants mpv
              WHERE mpv.marketplace_product_id = mp.id
            )
        )
        SELECT
          m.marketplace,
          m.external_id as "externalId",
          m.product_name as "productName",
          m.finish,
          m.language,
          m.group_id as "groupId",
          g.name as "groupName",
          g.group_kind as "groupKind",
          gs.slug as "groupSetSlug",
          m.market_cents as "marketCents",
          m.low_cents as "lowCents",
          m.mid_cents as "midCents",
          m.high_cents as "highCents",
          m.trend_cents as "trendCents",
          m.avg1_cents as "avg1Cents",
          m.avg7_cents as "avg7Cents",
          m.avg30_cents as "avg30Cents",
          m.recorded_at as "recordedAt",
          EXISTS (
            SELECT 1 FROM marketplace_product_card_overrides ov, target_card tc
            WHERE ov.marketplace_product_id = m.id
              AND ov.card_id = tc.id
          ) as "isOverride"
        FROM matched m
        LEFT JOIN marketplace_groups g
          ON g.marketplace = m.marketplace AND g.group_id = m.group_id
        LEFT JOIN sets gs ON gs.id = g.set_id
        ORDER BY m.marketplace, m.product_name
      `.execute(db);
      return result.rows;
    },
  };
}
