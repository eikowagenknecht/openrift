import { LOW_RARITIES, WellKnown } from "@openrift/shared";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, MarketplaceProductPricesTable } from "../db/index.js";

interface CollectionValueHistoryPoint {
  date: string;
  valueCents: number;
  copyCount: number;
}

interface ScopeFilter {
  sets?: string[];
  languages?: string[];
  domains?: string[];
  types?: string[];
  rarities?: string[];
  finishes?: string[];
  artVariants?: string[];
  setsExclude?: string[];
  languagesExclude?: string[];
  domainsExclude?: string[];
  typesExclude?: string[];
  raritiesExclude?: string[];
  finishesExclude?: string[];
  artVariantsExclude?: string[];
  keywords?: string[];
  tags?: string[];
  customTags?: string[];
  cardSizes?: string[];
  keywordsExclude?: string[];
  tagsExclude?: string[];
  customTagsExclude?: string[];
  keywordsPresence?: "any" | "none";
  tagsPresence?: "any" | "none";
  customTagsPresence?: "any" | "none";
  promos?: "only" | "exclude";
  signed?: boolean;
  banned?: boolean;
  errata?: boolean;
  standard?: boolean;
}

/**
 * Card has at least one of the given custom-tag slugs. Custom tags are joined
 * through `card_custom_tags`, so they can't be tested on the printing row the
 * way keywords and tags can.
 * @returns An EXISTS fragment for the slugs.
 */
function customTagExists(slugs: string[]) {
  const vals = sql.join(slugs.map((slug) => sql`${slug}`));
  return sql`EXISTS (
    SELECT 1 FROM card_custom_tags cct
    JOIN custom_tags ct ON ct.id = cct.custom_tag_id
    WHERE cct.card_id = c.id AND ct.slug IN (${vals})
  )`;
}

// The "standard printing" rule as SQL. Restates `isStandardPrinting` from
// @openrift/shared (normal art, unsigned, no markers, and a finish that counts
// as plain for the rarity) — the two must be changed together, since the web
// app filters the same axis with the TypeScript version.
const STANDARD_LOW_RARITIES = sql.join([...LOW_RARITIES].map((rarity) => sql`${rarity}`));

const STANDARD = sql`(
  COALESCE(NULLIF(p.art_variant, ''), ${WellKnown.artVariant.NORMAL}) = ${WellKnown.artVariant.NORMAL}
  AND p.is_signed = false
  AND cardinality(p.marker_slugs) = 0
  AND CASE
    WHEN p.rarity IN (${STANDARD_LOW_RARITIES}) THEN p.finish = ${WellKnown.finish.NORMAL}
    ELSE p.finish IN (${WellKnown.finish.NORMAL}, ${WellKnown.finish.FOIL})
  END
)`;

export interface CollectionValue {
  collectionId: string;
  totalValueCents: number;
  unpricedCopyCount: number;
}

/**
 * Read-only queries for marketplace prices and snapshots.
 *
 * Price queries read from `mv_daily_printing_prices` and its latest-day
 * derivative `mv_latest_printing_prices`, both refreshed after each
 * price-refresh pipeline run (see {@link refreshLatestPrices}). The headline
 * rule and the "cheapest bound SKU" aggregation live in the daily view, so
 * every surface that prices a printing agrees by construction. Don't
 * re-implement the headline CASE in a query here.
 *
 * @returns An object with marketplace query methods bound to the given `db`.
 */
export function marketplaceRepo(db: Kysely<Database>) {
  return {
    /**
     * Latest headline price per marketplace for every printing.
     *
     * `lastSeen` is the day the price was observed, not the day it was read.
     * The pipeline writes a snapshot only when a marketplace returns data, so
     * a delisted card keeps its final price indefinitely and looks current.
     *
     * @returns Rows with `printingId`, `marketplace`, the headline price as
     *          `marketCents`, and the `lastSeen` day as `YYYY-MM-DD`.
     */
    latestPrices(): Promise<
      { printingId: string; marketplace: string; marketCents: number; lastSeen: string }[]
    > {
      return db
        .selectFrom("mvLatestPrintingPrices")
        .select(["printingId", "marketplace", "headlineCents as marketCents", "lastSeen"])
        .execute();
    },

    /**
     * Cheap content token over {@link latestPrices}, for the content-addressed
     * price memo in `createRepos` (dynamic list rules that filter on price).
     * Hashes the materialized view itself — not the base snapshot tables — so
     * the token rolls exactly when {@link refreshLatestPrices} publishes new
     * data. A base-table probe would roll mid-pipeline (inserts land before
     * the refresh), caching the old view under the new token and then serving
     * it stale after the refresh until the next pipeline run.
     *
     * @returns An opaque token that changes iff the served price map changes.
     */
    async latestPricesContentVersion(): Promise<string> {
      const result = await sql<{ token: string }>`
        SELECT
          coalesce(count(*)::text, '0') || '|' ||
          coalesce(md5(string_agg(printing_id::text || ':' || marketplace || ':' || headline_cents::text || ':' || last_seen::text, ',' ORDER BY printing_id, marketplace)), '') AS token
        FROM mv_latest_printing_prices
      `.execute(db);
      return result.rows[0]?.token ?? "";
    },

    /**
     * Latest headline price per marketplace for a subset of printings.
     *
     * Same data as {@link latestPrices} but filtered to the given printing IDs.
     *
     * @returns Rows with `printingId`, `marketplace`, and the headline price as `marketCents`.
     */
    latestPricesForPrintings(
      printingIds: string[],
    ): Promise<{ printingId: string; marketplace: string; marketCents: number }[]> {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("mvLatestPrintingPrices")
        .select(["printingId", "marketplace", "headlineCents as marketCents"])
        .where("printingId", "in", printingIds)
        .execute();
    },

    /**
     * @returns Marketplace variants linked to a printing, including cross-language
     *          aggregate variants attached to any sibling printing. The `language`
     *          field is `null` for aggregate variants so callers can label them.
     */
    async sourcesForPrinting(printingId: string): Promise<
      {
        variantId: string;
        externalId: number;
        marketplace: string;
        language: string | null;
      }[]
    > {
      const result = await sql<{
        variantId: string;
        externalId: number;
        marketplace: string;
        language: string | null;
      }>`
        SELECT
          mpv.id as "variantId",
          mp.external_id as "externalId",
          mp.marketplace as "marketplace",
          mp.language as "language"
        FROM marketplace_product_variants mpv
        JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
        WHERE mpv.printing_id = ${printingId}
      `.execute(db);
      return result.rows;
    },

    /**
     * Batch version of {@link sourcesForPrinting}. Returns marketplace source rows
     * for each given printing, tagged with the target `printingId` so callers can
     * group by printing without replaying the sibling fan-out join client-side.
     *
     * @returns Rows keyed by the requested `printingId`.
     */
    async sourcesForPrintings(printingIds: string[]): Promise<
      {
        printingId: string;
        externalId: number;
        marketplace: string;
      }[]
    > {
      if (printingIds.length === 0) {
        return [];
      }
      const result = await sql<{
        printingId: string;
        externalId: number;
        marketplace: string;
      }>`
        SELECT
          mpv.printing_id as "printingId",
          mp.external_id as "externalId",
          mp.marketplace as "marketplace"
        FROM marketplace_product_variants mpv
        JOIN marketplace_products mp ON mp.id = mpv.marketplace_product_id
        WHERE mpv.printing_id = ANY(${printingIds}::uuid[])
      `.execute(db);
      return result.rows;
    },

    /**
     * Price history for the product a variant is bound to. Every variant for
     * the same SKU resolves to the same history — prices live on the product,
     * not the binding.
     * @returns Rows for the variant's parent product, optionally filtered by
     *          a cutoff date, ordered chronologically.
     */
    snapshots(
      variantId: string,
      cutoff: Date | null,
    ): Promise<
      Pick<
        Selectable<MarketplaceProductPricesTable>,
        "recordedAt" | "marketCents" | "lowCents" | "zeroLowCents"
      >[]
    > {
      let query = db
        .selectFrom("marketplaceProductPrices as pp")
        .innerJoin(
          "marketplaceProductVariants as mpv",
          "mpv.marketplaceProductId",
          "pp.marketplaceProductId",
        )
        .select(["pp.recordedAt", "pp.marketCents", "pp.lowCents", "pp.zeroLowCents"])
        .where("mpv.id", "=", variantId)
        .orderBy("pp.recordedAt", "asc");
      if (cutoff) {
        query = query.where("pp.recordedAt", ">=", cutoff);
      }
      return query.execute();
    },

    /**
     * Total market value per deck for a user.
     *
     * Uses the cheapest printing of each card (from the materialized view)
     * to estimate what it would cost to buy the deck on a given marketplace.
     * Overflow is skipped — it's a parking zone for cards the user hasn't
     * committed to the deck, and the deck editor leaves it out of its own
     * value figure too (see `computeDeckOwnership` in the web app).
     *
     * `languages` mirrors `cheapestPrice` in the web app's
     * `computeDeckOwnership` exactly, so a deck tile and the deck page quote
     * the same basis: the cheapest priced printing whose language the viewer
     * collects, falling back to the cheapest priced printing in any language
     * when the card has none priced in those. This matters on marketplaces
     * with per-language prices (CardTrader) — without it a cheap foreign
     * printing drags the tile below what the deck page shows. An empty list
     * means "no language preference" and prices at the plain cheapest.
     *
     * @returns A map from deck ID to total value in cents.
     */
    async deckValues(
      userId: string,
      marketplace: string,
      languages?: readonly string[],
    ): Promise<Map<string, number>> {
      const preferredLanguages = [...(languages ?? [])];
      const rows = await sql<{ deckId: string; totalValueCents: number }>`
        SELECT
          dc.deck_id AS "deckId",
          COALESCE(SUM(dc.quantity * cheapest.headline_cents), 0)::int AS "totalValueCents"
        FROM deck_cards dc
        INNER JOIN decks d ON d.id = dc.deck_id AND d.user_id = ${userId}
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            MIN(mvp.headline_cents) FILTER (
              WHERE p.language = ANY(${preferredLanguages}::text[])
            ),
            MIN(mvp.headline_cents)
          ) AS headline_cents
          FROM printings p
          INNER JOIN mv_latest_printing_prices mvp
            ON mvp.printing_id = p.id AND mvp.marketplace = ${marketplace}
          WHERE p.card_id = dc.card_id
        ) cheapest ON true
        WHERE dc.zone <> ${WellKnown.deckZone.OVERFLOW}
        GROUP BY dc.deck_id
      `.execute(db);

      return new Map(rows.rows.map((row) => [row.deckId, row.totalValueCents]));
    },

    /**
     * Total market value and unpriced copy count for the given collection IDs.
     * Caller passes the list of accessible collections (personal + shared) so that
     * shared collections — whose copies carry the contributors' user_ids, not the
     * viewer's — are included.
     *
     * @returns A map from collection ID to value data.
     */
    async collectionValues(
      collectionIds: readonly string[],
      marketplace: string,
    ): Promise<Map<string, CollectionValue>> {
      if (collectionIds.length === 0) {
        return new Map();
      }
      const ids = collectionIds as string[];
      const rows = await sql<CollectionValue>`
        SELECT
          cp.collection_id AS "collectionId",
          COALESCE(SUM(mvp.headline_cents), 0)::int AS "totalValueCents",
          (COUNT(cp.id) - COUNT(mvp.headline_cents))::int AS "unpricedCopyCount"
        FROM copies cp
        LEFT JOIN mv_latest_printing_prices mvp
          ON mvp.printing_id = cp.printing_id AND mvp.marketplace = ${marketplace}
        WHERE cp.collection_id IN (${sql.join(ids)})
        GROUP BY cp.collection_id
      `.execute(db);

      return new Map(rows.rows.map((row) => [row.collectionId, row]));
    },

    /**
     * Total market value and unpriced copy count for a single collection.
     *
     * @returns Value data for the collection, or undefined if it has no copies.
     */
    async singleCollectionValue(
      collectionId: string,
      marketplace: string,
    ): Promise<CollectionValue | undefined> {
      const rows = await sql<CollectionValue>`
        SELECT
          cp.collection_id AS "collectionId",
          COALESCE(SUM(mvp.headline_cents), 0)::int AS "totalValueCents",
          (COUNT(cp.id) - COUNT(mvp.headline_cents))::int AS "unpricedCopyCount"
        FROM copies cp
        LEFT JOIN mv_latest_printing_prices mvp
          ON mvp.printing_id = cp.printing_id AND mvp.marketplace = ${marketplace}
        WHERE cp.collection_id = ${collectionId}
        GROUP BY cp.collection_id
      `.execute(db);

      return rows.rows[0];
    },

    /**
     * Collection value over time, computed from today's copies walked backwards
     * through collection events.
     *
     * The replay is anchored to the present, not the past. Today's composition
     * is not derived from event history — it is read from `copies`, the same
     * rows {@link collectionValues} sums — and events are then undone day by
     * day to reconstruct the past. This makes "the last point equals the Stats
     * card" structural rather than a property that happens to hold when the
     * event log is complete.
     *
     * It is not complete. 6573 `removed` events across 8 accounts have no
     * matching `added`, because event logging predates their copies and
     * migration 139's backfill could only cover copies that still existed when
     * it ran. A forward replay clamps per printing across all collections, so
     * one of those orphan removals silently cancels a live copy of the same
     * printing sitting in a different collection. Walking backwards, the same
     * orphans only make historical days look slightly larger, which is honest:
     * those copies did exist then.
     *
     * Errors therefore accumulate into the past rather than into the headline
     * figure. A historical point reads "what I hold now, minus the events
     * since" — identical to "what I held then" for an account with complete
     * history, and closer to the truth than a forward replay for one without.
     *
     * @returns Daily value points for charting, oldest first.
     */
    async collectionValueTimeSeries(params: {
      userId: string;
      marketplace: string;
      collectionIds: string[] | null;
      cutoff: Date | null;
      scope: ScopeFilter;
    }): Promise<CollectionValueHistoryPoint[]> {
      const { userId, marketplace, collectionIds, cutoff, scope } = params;

      // Scope filter clauses on the printing itself. Both the event query and
      // the anchor query below join printings/cards/sets under the same p/c/s
      // aliases, so one fragment serves both — they must agree, or the anchor
      // would count copies the walk never sees. Each array filter uses a
      // parameterized IN-list via sql.join to avoid SQL injection from
      // user-provided values.
      const scopeClauses: ReturnType<typeof sql>[] = [];
      if (scope.sets?.length) {
        const vals = sql.join(scope.sets.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND s.slug IN (${vals})`);
      }
      if (scope.languages?.length) {
        const vals = sql.join(scope.languages.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.language IN (${vals})`);
      }
      if (scope.types?.length) {
        const vals = sql.join(scope.types.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND c.type IN (${vals})`);
      }
      if (scope.rarities?.length) {
        const vals = sql.join(scope.rarities.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.rarity IN (${vals})`);
      }
      if (scope.finishes?.length) {
        const vals = sql.join(scope.finishes.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.finish IN (${vals})`);
      }
      if (scope.artVariants?.length) {
        const vals = sql.join(scope.artVariants.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.art_variant IN (${vals})`);
      }
      if (scope.domains?.length) {
        const vals = sql.join(scope.domains.map((val) => sql`${val}`));
        scopeClauses.push(
          sql`AND EXISTS (SELECT 1 FROM card_domains cd WHERE cd.card_id = c.id AND cd.domain_slug IN (${vals}))`,
        );
      }
      // Negation companions (ADR-034). `types` is a single column here, so its
      // exclude is a plain NOT IN; `domains` is a join table, so one excluded
      // domain on the card rejects it (matching `noneExcluded` in the web
      // filters and `matchesScope` on the stats page).
      if (scope.setsExclude?.length) {
        const vals = sql.join(scope.setsExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND s.slug NOT IN (${vals})`);
      }
      if (scope.languagesExclude?.length) {
        const vals = sql.join(scope.languagesExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.language NOT IN (${vals})`);
      }
      if (scope.typesExclude?.length) {
        const vals = sql.join(scope.typesExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND c.type NOT IN (${vals})`);
      }
      if (scope.raritiesExclude?.length) {
        const vals = sql.join(scope.raritiesExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.rarity NOT IN (${vals})`);
      }
      if (scope.finishesExclude?.length) {
        const vals = sql.join(scope.finishesExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.finish NOT IN (${vals})`);
      }
      if (scope.artVariantsExclude?.length) {
        const vals = sql.join(scope.artVariantsExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.art_variant NOT IN (${vals})`);
      }
      if (scope.domainsExclude?.length) {
        const vals = sql.join(scope.domainsExclude.map((val) => sql`${val}`));
        scopeClauses.push(
          sql`AND NOT EXISTS (SELECT 1 FROM card_domains cd WHERE cd.card_id = c.id AND cd.domain_slug IN (${vals}))`,
        );
      }
      // Keywords and tags are text[] columns on the card, so include/exclude
      // are array-overlap tests.
      if (scope.keywords?.length) {
        const vals = sql.join(scope.keywords.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND c.keywords && ARRAY[${vals}]::text[]`);
      }
      if (scope.keywordsExclude?.length) {
        const vals = sql.join(scope.keywordsExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND NOT (c.keywords && ARRAY[${vals}]::text[])`);
      }
      if (scope.tags?.length) {
        const vals = sql.join(scope.tags.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND c.tags && ARRAY[${vals}]::text[]`);
      }
      if (scope.tagsExclude?.length) {
        const vals = sql.join(scope.tagsExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND NOT (c.tags && ARRAY[${vals}]::text[])`);
      }
      if (scope.customTags?.length) {
        scopeClauses.push(sql`AND ${customTagExists(scope.customTags)}`);
      }
      if (scope.customTagsExclude?.length) {
        scopeClauses.push(sql`AND NOT ${customTagExists(scope.customTagsExclude)}`);
      }
      if (scope.cardSizes?.length) {
        const vals = sql.join(scope.cardSizes.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.size IN (${vals})`);
      }
      if (scope.keywordsPresence) {
        scopeClauses.push(
          scope.keywordsPresence === "any"
            ? sql`AND cardinality(c.keywords) > 0`
            : sql`AND cardinality(c.keywords) = 0`,
        );
      }
      if (scope.tagsPresence) {
        scopeClauses.push(
          scope.tagsPresence === "any"
            ? sql`AND cardinality(c.tags) > 0`
            : sql`AND cardinality(c.tags) = 0`,
        );
      }
      if (scope.customTagsPresence) {
        const hasAny = sql`EXISTS (SELECT 1 FROM card_custom_tags cct WHERE cct.card_id = c.id)`;
        scopeClauses.push(
          scope.customTagsPresence === "any" ? sql`AND ${hasAny}` : sql`AND NOT ${hasAny}`,
        );
      }
      if (scope.standard !== undefined) {
        scopeClauses.push(scope.standard ? sql`AND ${STANDARD}` : sql`AND NOT ${STANDARD}`);
      }
      if (scope.promos === "only") {
        scopeClauses.push(sql`AND cardinality(p.marker_slugs) > 0`);
      } else if (scope.promos === "exclude") {
        scopeClauses.push(sql`AND cardinality(p.marker_slugs) = 0`);
      }
      if (scope.signed === true) {
        scopeClauses.push(sql`AND p.is_signed = true`);
      } else if (scope.signed === false) {
        scopeClauses.push(sql`AND p.is_signed = false`);
      }
      if (scope.banned === true) {
        scopeClauses.push(
          sql`AND EXISTS (SELECT 1 FROM card_bans cb WHERE cb.card_id = c.id AND cb.unbanned_at IS NULL)`,
        );
      } else if (scope.banned === false) {
        scopeClauses.push(
          sql`AND NOT EXISTS (SELECT 1 FROM card_bans cb WHERE cb.card_id = c.id AND cb.unbanned_at IS NULL)`,
        );
      }
      if (scope.errata === true) {
        scopeClauses.push(sql`AND EXISTS (SELECT 1 FROM card_errata ce2 WHERE ce2.card_id = c.id)`);
      } else if (scope.errata === false) {
        scopeClauses.push(
          sql`AND NOT EXISTS (SELECT 1 FROM card_errata ce2 WHERE ce2.card_id = c.id)`,
        );
      }

      const scopeFragment = scopeClauses.length > 0 ? sql.join(scopeClauses, sql` `) : sql``;

      // ── Query A: today's composition, the anchor ───────────────────────
      // In all-collections mode this is personal copies only. Copies in a
      // friend-group collection belong to the group, and `buildStacks` in the
      // web app leaves them out of the aggregate the Stats card shows — the
      // anchor has to draw the same line or the two figures disagree on day
      // one. Scoped to explicit collection ids, every copy in them counts (a
      // group collection is viewed via its own id).
      const anchorCollectionClause = collectionIds
        ? sql`cp.collection_id IN (${sql.join(collectionIds.map((id) => sql`${id}::uuid`))})`
        : sql`col.user_id = ${userId} AND col.group_id IS NULL`;

      const anchorRows = await sql<{ printingId: string; copies: number }>`
        SELECT cp.printing_id AS "printingId", count(*)::int AS copies
        FROM copies cp
        INNER JOIN collections col ON col.id = cp.collection_id
        INNER JOIN printings p ON p.id = cp.printing_id
        INNER JOIN cards c ON c.id = p.card_id
        INNER JOIN sets s ON s.id = p.set_id
        WHERE ${anchorCollectionClause}
          ${scopeFragment}
        GROUP BY cp.printing_id
      `.execute(db);

      // ── Query B: events to undo, newest last ───────────────────────────
      // Only events inside the window are needed. A forward replay had to read
      // the user's entire history to build the pre-cutoff state; anchoring to
      // the present means the 7d/30d/90d ranges never touch older rows.
      //
      // `fromIsGroup` / `toIsGroup` let all-collections mode keep the anchor's
      // personal-only line while walking back: a move across the group
      // boundary is a real entry or exit from the personal total, and an add
      // straight into a group collection never belonged to it. Events written
      // before migration 220 may have lost their collection id to the old
      // ON DELETE SET NULL and read as non-group, which is right for every
      // affected account — deleting a group collection is rarer still.
      const windowStartDay = cutoff ? toDateString(cutoff) : null;
      const windowClause = windowStartDay
        ? sql`AND ce.created_at >= ${windowStartDay}::date`
        : sql``;

      const events = await sql<{
        action: string;
        printingId: string;
        fromCollectionId: string | null;
        toCollectionId: string | null;
        fromIsGroup: boolean;
        toIsGroup: boolean;
        createdAt: Date;
      }>`
        SELECT
          ce.action,
          ce.printing_id AS "printingId",
          ce.from_collection_id AS "fromCollectionId",
          ce.to_collection_id AS "toCollectionId",
          (cf.group_id IS NOT NULL) AS "fromIsGroup",
          (ctc.group_id IS NOT NULL) AS "toIsGroup",
          ce.created_at AS "createdAt"
        FROM collection_events ce
        INNER JOIN printings p ON p.id = ce.printing_id
        INNER JOIN cards c ON c.id = p.card_id
        INNER JOIN sets s ON s.id = p.set_id
        LEFT JOIN collections cf ON cf.id = ce.from_collection_id
        LEFT JOIN collections ctc ON ctc.id = ce.to_collection_id
        WHERE ce.user_id = ${userId}
          ${windowClause}
          ${scopeFragment}
        ORDER BY ce.created_at ASC
      `.execute(db);

      if (events.rows.length === 0 && anchorRows.rows.length === 0) {
        return [];
      }

      // Prices are needed for anything held today and anything touched inside
      // the window — a printing sold off mid-window is absent from the anchor
      // but reappears as we walk back.
      const printingIds = [
        ...new Set([
          ...anchorRows.rows.map((r) => r.printingId),
          ...events.rows.map((e) => e.printingId),
        ]),
      ];

      // ── Query B: daily prices for those printings ──────────────────────
      // Read straight from mv_daily_printing_prices (migration 219). The
      // headline rule and the cheapest-bound-SKU aggregation live in the view,
      // so the last point of this series and the Stats card's figure come from
      // the same rows — mv_latest_printing_prices is that view's latest day.
      // Do not reintroduce a hand-rolled headline CASE here.
      const dailyPrices = await sql<{
        printingId: string;
        day: string;
        headlineCents: number;
      }>`
        SELECT
          d.printing_id AS "printingId",
          d.day::text AS day,
          d.headline_cents AS "headlineCents"
        FROM mv_daily_printing_prices d
        WHERE d.printing_id IN (${sql.join(printingIds.map((id) => sql`${id}::uuid`))})
          AND d.marketplace = ${marketplace}
      `.execute(db);

      // Build a lookup: printingId -> day -> headlineCents
      const priceMap = new Map<string, Map<string, number>>();
      for (const row of dailyPrices.rows) {
        let dayMap = priceMap.get(row.printingId);
        if (!dayMap) {
          dayMap = new Map();
          priceMap.set(row.printingId, dayMap);
        }
        dayMap.set(row.day, row.headlineCents);
      }

      // Snapshot days per printing, ascending. The walk visits days in
      // descending order, so a per-printing cursor onto this array only ever
      // moves left — the price for a day is the latest snapshot at or before
      // it, same rule the Stats card gets from mv_latest_printing_prices.
      const sortedPriceDays = new Map<string, string[]>();
      for (const [printingId, dayMap] of priceMap) {
        sortedPriceDays.set(printingId, [...dayMap.keys()].toSorted());
      }
      const priceCursor = new Map<string, number>();

      /**
       * Price for `printingId` on `dayStr`, carried back from the latest
       * snapshot at or before it. Only correct when called with a
       * non-increasing `dayStr`, which the backward walk guarantees.
       * @returns The price in cents, or undefined if no snapshot is that old.
       */
      function priceOnDay(printingId: string, dayStr: string): number | undefined {
        const days = sortedPriceDays.get(printingId);
        if (!days || days.length === 0) {
          return undefined;
        }
        let idx = priceCursor.get(printingId) ?? days.length - 1;
        while (idx >= 0 && days[idx] > dayStr) {
          idx--;
        }
        priceCursor.set(printingId, idx);
        if (idx < 0) {
          return undefined;
        }
        return priceMap.get(printingId)?.get(days[idx]);
      }

      // ── Backward replay ───────────────────────────────────────────────
      const targetCollectionSet = collectionIds ? new Set(collectionIds) : null;

      /**
       * How much an event added to the tracked total when it happened. The
       * walk subtracts this to step back over the event.
       * @returns +1, -1, or 0.
       */
      function eventDelta(event: (typeof events.rows)[0]): number {
        if (targetCollectionSet) {
          const toTarget = event.toCollectionId
            ? targetCollectionSet.has(event.toCollectionId)
            : false;
          const fromTarget = event.fromCollectionId
            ? targetCollectionSet.has(event.fromCollectionId)
            : false;

          if (event.action === "added" && toTarget) {
            return 1;
          }
          if (event.action === "removed" && fromTarget) {
            return -1;
          }
          if (event.action === "moved") {
            if (toTarget && !fromTarget) {
              return 1;
            }
            if (fromTarget && !toTarget) {
              return -1;
            }
          }
          return 0;
        }
        // All-collections mode tracks the personal total, so group
        // collections sit outside it and crossing the boundary counts.
        if (event.action === "added") {
          return event.toIsGroup ? 0 : 1;
        }
        if (event.action === "removed") {
          return event.fromIsGroup ? 0 : -1;
        }
        if (event.action === "moved") {
          if (event.fromIsGroup && !event.toIsGroup) {
            return 1;
          }
          if (!event.fromIsGroup && event.toIsGroup) {
            return -1;
          }
        }
        return 0;
      }

      /** Steps the composition back over one event. @returns void */
      function undo(event: (typeof events.rows)[0]): void {
        const delta = eventDelta(event);
        if (delta === 0) {
          return;
        }
        const next = (composition.get(event.printingId) ?? 0) - delta;
        if (next <= 0) {
          composition.delete(event.printingId);
        } else {
          composition.set(event.printingId, next);
        }
      }

      const endDay = toDateString(new Date());
      // A requested range spans its whole window even with no events in it —
      // a collection nobody touched for a month is a flat month, not a single
      // point. Without a cutoff the series starts at the first event, or at
      // today for a collection whose copies predate any logged event.
      const startDay =
        windowStartDay ??
        (events.rows.length > 0 ? toDateString(events.rows[0].createdAt) : endDay);

      // Seed from today's copies, then undo events newest-first.
      const composition = new Map<string, number>(
        anchorRows.rows.map((row) => [row.printingId, row.copies]),
      );
      let eventIndex = events.rows.length - 1;

      // Events dated after today (clock skew, or a same-day event recorded in
      // a later timezone) belong to no emitted point — undo them up front so
      // they don't leak into today's figure.
      while (eventIndex >= 0 && toDateString(events.rows[eventIndex].createdAt) > endDay) {
        undo(events.rows[eventIndex]);
        eventIndex--;
      }

      const reversed: CollectionValueHistoryPoint[] = [];
      const currentDay = new Date(endDay);

      while (toDateString(currentDay) >= startDay) {
        const dayStr = toDateString(currentDay);

        let valueCents = 0;
        let copyCount = 0;
        for (const [printingId, count] of composition) {
          const price = priceOnDay(printingId, dayStr);
          if (price !== undefined) {
            valueCents += price * count;
          }
          copyCount += count;
        }
        reversed.push({ date: dayStr, valueCents, copyCount });

        // Step back over this day's events to reach the previous day.
        while (eventIndex >= 0 && toDateString(events.rows[eventIndex].createdAt) === dayStr) {
          undo(events.rows[eventIndex]);
          eventIndex--;
        }

        currentDay.setUTCDate(currentDay.getUTCDate() - 1);
      }

      const series = reversed.toReversed();

      // Drop leading empty days: an account whose earliest activity cancelled
      // out (adds undone by removes the same week, common in early testing)
      // shouldn't open on a flat zero run.
      let firstHeld = 0;
      while (firstHeld < series.length && series[firstHeld].copyCount === 0) {
        firstHeld++;
      }
      return series.slice(firstHeld);
    },

    /**
     * Refresh the price materialized views. Uses CONCURRENTLY so reads aren't
     * blocked during refresh.
     *
     * Order matters: `mv_latest_printing_prices` is defined over
     * `mv_daily_printing_prices`, so refreshing it reads whatever the daily
     * view currently holds. Daily first, or the latest view republishes
     * yesterday's data under today's content token.
     *
     * @returns void
     */
    async refreshLatestPrices(): Promise<void> {
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_printing_prices`.execute(db);
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_latest_printing_prices`.execute(db);
    },
  };
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
