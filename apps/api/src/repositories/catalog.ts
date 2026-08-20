import { WellKnown } from "@openrift/shared";
import type { SetReleases } from "@openrift/shared";
import type { CardType, Domain, SuperType } from "@openrift/shared/types";
import type { Kysely, NotNull, RawBuilder, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  CardBansTable,
  CardErrataTable,
  CardsTable,
  Database,
  PrintingImagesTable,
  PrintingsTable,
  SetsTable,
} from "../db/index.js";
import { fallbackImageId, imageId } from "./query-helpers.js";

/** Card columns returned by the catalog (excludes normName and timestamps). */
type CatalogCardRow = Omit<Selectable<CardsTable>, "normName" | "createdAt" | "updatedAt"> & {
  domains: Domain[];
  superTypes: SuperType[];
  types: CardType[];
  tokenCardIds: string[];
};

/**
 * `mv_card_aggregates` types its slug arrays as plain `string[]` — a view can't
 * carry the vocabulary unions — so every read of it narrows to the catalog's
 * types. One alias rather than three inline objects, so a column added to the
 * view can't be narrowed at one call site and forgotten at the next.
 */
interface CardAggregateNarrowing {
  domains: Domain[];
  superTypes: SuperType[];
  types: CardType[];
}

/** Active ban row returned by the catalog. */
type CatalogCardBanRow = Pick<
  Selectable<CardBansTable>,
  "cardId" | "formatId" | "bannedAt" | "reason"
> & { formatName: string };

/** Card errata row returned by the catalog. */
type CatalogCardErrataRow = Pick<
  Selectable<CardErrataTable>,
  "cardId" | "correctedRulesText" | "correctedEffectText" | "source" | "sourceUrl" | "effectiveDate"
>;

/**
 * Set columns returned by the catalog, with the per-language release periods
 * folded in. No `released` boolean: clients derive it from the dates via
 * `isReleased`, so a cached response can't claim a set is still upcoming a
 * week after its date passed.
 */
type CatalogSetRow = Pick<Selectable<SetsTable>, "id" | "slug" | "name" | "setType"> & {
  releases: SetReleases;
};

/** A printing's lookup codes, for code-based card search. */
type PrintingCodeRow = Pick<Selectable<PrintingsTable>, "cardId" | "shortCode" | "publicCode">;

/** Active printing image with resolved image_files.id (null IDs filtered at query level). */
type CatalogPrintingImageRow = Pick<Selectable<PrintingImagesTable>, "printingId" | "face"> & {
  imageId: string;
};

/** One scanner bank reference: a front render plus its label identity. */
export interface ScanReferenceRow {
  imageId: string;
  name: string;
  setSlug: string;
  publicCode: string;
  language: string;
  cardType: string;
  artVariant: string | null;
  createdAt: Date;
  /**
   * Min/max serialized marker set over every active front printing sharing
   * this image. Equal means the image's marker set is unanimous; a mismatch
   * means one render serves stamped and unstamped printings and carries no
   * stamp evidence for the scanner's disambiguation.
   */
  markersMin: string;
  markersMax: string;
}

/**
 * Printing row returned by the catalog. `markerSlugs` is the printing's
 * denormalized sorted marker array (empty for unmarked printings).
 * Marker metadata (label/description) and distribution channels are resolved
 * separately by the route layer using the catalog's `markersList()` and
 * the distribution-channels repo.
 *
 * `canonicalRank` is the integer sort key from the `printings_ordered` view
 * (see migration 096). Clients sort by this integer and get language-first,
 * set-order, shortCode, non-promo-first, finish-sort-order semantics in one
 * compare. User language preference overrides the language axis post-query.
 */
type CatalogPrintingRow = Omit<
  Selectable<PrintingsTable>,
  "createdAt" | "updatedAt" | "fallbackImageFileId"
> & {
  printedName: string | null;
  language: string;
  markerSlugs: string[];
  comment: string | null;
  canonicalRank: number;
  /**
   * The pinned substitute's *servable* image id: the raw
   * `fallback_image_file_id` resolved through the same rehosted-or-nothing rule
   * as every other image id (see {@link fallbackImageId}). Null both when
   * nothing is pinned and when the pinned file has no rehosted copy yet.
   */
  fallbackImageId: string | null;
};

/** Selecting from `printings_ordered` (the view) so we get `canonical_rank` too. */
const PRINTING_VIEW_COLUMNS = [
  "printingsOrdered.id",
  "printingsOrdered.cardId",
  "printingsOrdered.setId",
  "printingsOrdered.shortCode",
  "printingsOrdered.rarity",
  "printingsOrdered.artVariant",
  "printingsOrdered.isSigned",
  "printingsOrdered.finish",
  "printingsOrdered.size",
  "printingsOrdered.artist",
  "printingsOrdered.publicCode",
  "printingsOrdered.printedRulesText",
  "printingsOrdered.printedEffectText",
  "printingsOrdered.flavorText",
  "printingsOrdered.printedName",
  "printingsOrdered.printedYear",
  "printingsOrdered.language",
  "printingsOrdered.markerSlugs",
  "printingsOrdered.comment",
  "printingsOrdered.canonicalRank",
  "printingsOrdered.fallbackArtMode",
  fallbackImageId("printingsOrdered"),
] as const;

/**
 * The per-language release map for a set, as a correlated subquery so the set
 * reads stay one round trip. Returns `{}` for a set announced nowhere.
 * @returns A jsonb expression aliased as `releases`.
 */
function releasesJson() {
  return sql<SetReleases>`coalesce((
    SELECT jsonb_object_agg(
      r.language,
      jsonb_build_object('releasedAt', r.released_at, 'precision', r.precision)
    )
    FROM set_releases r
    WHERE r.set_id = sets.id
  ), '{}'::jsonb)`.as("releases");
}

/**
 * The stored-catalog aggregates both tokens share, WITHOUT any notion of
 * "today". Kept at module scope, and as a fragment rather than a query, so the
 * two callers compose one expression instead of maintaining two copies that
 * drift apart.
 *
 * The date is deliberately not in here. It belongs to exactly one of the two
 * callers — see {@link catalogContentVersion} — and folding it in for both
 * would roll the catalog's ETag at every UTC midnight, expiring every client's
 * year-long `immutable` cache entry daily for no change in the bytes.
 *
 * Timestamps are pinned to UTC before being rendered because `timestamptz::text`
 * formats in the *session* time zone. Without the pin, two API instances (or one
 * instance after a config change) would compute different tokens for identical
 * data, which for a cache key is a correctness bug rather than a cosmetic one.
 */
const STORED_CATALOG_AGGREGATES = sql<string>`
      coalesce((SELECT count(*) FROM cards)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM cards)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM printings)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM printings)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM sets)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM sets)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM card_bans)::text, '') || ':' ||
      coalesce((SELECT max(created_at) AT TIME ZONE 'UTC' FROM card_bans)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM card_errata)::text, '') || ':' ||
      coalesce((SELECT max(created_at) AT TIME ZONE 'UTC' FROM card_errata)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM markers)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM markers)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM printing_markers)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM distribution_channels)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM distribution_channels)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM printing_distribution_channels)::text, '') || '|' ||
      coalesce((SELECT md5(string_agg(card_id::text || ':' || domain_slug || ':' || ordinal::text, ',' ORDER BY card_id, domain_slug)) FROM card_domains), '') || '|' ||
      coalesce((SELECT md5(string_agg(card_id::text || ':' || super_type_slug, ',' ORDER BY card_id, super_type_slug)) FROM card_super_types), '') || '|' ||
      coalesce((SELECT md5(string_agg(card_id::text || ':' || custom_tag_id::text, ',' ORDER BY card_id, custom_tag_id)) FROM card_custom_tags), '') || '|' ||
      coalesce((SELECT count(*) FROM custom_tags)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM custom_tags)::text, '') || '|' ||
      coalesce((SELECT count(*) FROM set_releases)::text, '') || ':' ||
      coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM set_releases)::text, '')
`;

/**
 * @returns The md5 of `expression`, or "" when the row is somehow absent.
 */
async function hashedToken(db: Kysely<Database>, expression: RawBuilder<string>): Promise<string> {
  const result = await sql<{ token: string }>`SELECT md5(${expression}) AS token`.execute(db);
  return result.rows[0]?.token ?? "";
}

/**
 * Read-only queries for the card catalog (sets + printings + cards).
 *
 * The `.select()` columns in each method define the public API contract —
 * the catalog route spreads these rows directly into the response. Only
 * select columns that are safe to expose to clients.
 *
 * @returns An object with catalog query methods bound to the given `db`.
 */
export function catalogRepo(db: Kysely<Database>) {
  return {
    /** @returns All sets ordered by their display position. */
    async sets(): Promise<CatalogSetRow[]> {
      const rows = await db
        .selectFrom("sets")
        .select(["id", "slug", "name", "setType", releasesJson()])
        .orderBy("sortOrder")
        .execute();
      return rows;
    },

    /**
     * Catalogue-wide list of distinct `cards.tags` values appearing on Legend
     * cards. Each Legend has exactly one tag (the champion's name), so this
     * is the canonical set of champion-identifier tags — used by Custom-Region
     * to tell champion-name tags apart from region/utility tags during deck
     * validation.
     *
     * @returns Sorted, distinct champion-identifier tags.
     */
    async championIdentifierTags(): Promise<string[]> {
      const result = await sql<{ tag: string }>`
        SELECT DISTINCT unnest(tags) AS tag
        FROM cards
        WHERE EXISTS (
          SELECT 1 FROM card_card_types cct
          WHERE cct.card_id = cards.id AND cct.type_slug = ${WellKnown.cardType.LEGEND}
        )
        ORDER BY tag
      `.execute(db);
      return result.rows.map((row) => row.tag);
    },

    /** @returns All cards (no printings), for building a card lookup. */
    cards(): Promise<CatalogCardRow[]> {
      return db
        .selectFrom("cards")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "cards.id")
        .select([
          "cards.id",
          "cards.slug",
          "cards.name",
          "cards.type",
          "cards.might",
          "cards.energy",
          "cards.power",
          "cards.mightBonus",
          "cards.keywords",
          "cards.tags",
          "cards.maxCopiesOverride",
          "cards.comment",
          "mca.domains",
          "mca.superTypes",
          "mca.tokenCardIds",
          "mca.types",
        ])
        .orderBy("cards.name")
        .$narrowType<CardAggregateNarrowing>()
        .execute();
    },

    /** @returns All active card bans (not yet unbanned), with format display name. */
    cardBans(): Promise<CatalogCardBanRow[]> {
      return db
        .selectFrom("cardBans")
        .innerJoin("formats", "formats.id", "cardBans.formatId")
        .select([
          "cardBans.cardId",
          "cardBans.formatId",
          "cardBans.bannedAt",
          "cardBans.reason",
          "formats.name as formatName",
        ])
        .where("unbannedAt", "is", null)
        .execute();
    },

    /** @returns All card errata (one per card at most). */
    cardErrata(): Promise<CatalogCardErrataRow[]> {
      return db
        .selectFrom("cardErrata")
        .select([
          "cardId",
          "correctedRulesText",
          "correctedEffectText",
          "source",
          "sourceUrl",
          "effectiveDate",
        ])
        .execute();
    },

    /** @returns Active bans for a set of cards. */
    cardBansByCardIds(cardIds: string[]): Promise<CatalogCardBanRow[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("cardBans")
        .innerJoin("formats", "formats.id", "cardBans.formatId")
        .select([
          "cardBans.cardId",
          "cardBans.formatId",
          "cardBans.bannedAt",
          "cardBans.reason",
          "formats.name as formatName",
        ])
        .where("cardBans.cardId", "in", cardIds)
        .where("unbannedAt", "is", null)
        .execute();
    },

    /** @returns Errata for a set of cards. */
    cardErrataByCardIds(cardIds: string[]): Promise<CatalogCardErrataRow[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("cardErrata")
        .select([
          "cardId",
          "correctedRulesText",
          "correctedEffectText",
          "source",
          "sourceUrl",
          "effectiveDate",
        ])
        .where("cardId", "in", cardIds)
        .execute();
    },

    /** @returns All printings in canonical order (see `printings_ordered` view). */
    printings(): Promise<CatalogPrintingRow[]> {
      return db
        .selectFrom("printingsOrdered")
        .select(PRINTING_VIEW_COLUMNS)
        .orderBy("printingsOrdered.canonicalRank")
        .execute();
    },

    /**
     * Just the two lookup codes per printing, for building a code index. The
     * full `printings()` read carries every printed rules and flavor text on
     * every row, which is orders of magnitude more bytes than a code lookup
     * needs.
     *
     * @returns Each printing's card id and its short and public codes.
     */
    printingCodes(): Promise<PrintingCodeRow[]> {
      return db
        .selectFrom("printings")
        .select(["cardId", "shortCode", "publicCode"])
        .orderBy("shortCode")
        .execute();
    },

    /** @returns All active printing images (front and back), ordered by printing then face. */
    printingImages(): Promise<CatalogPrintingImageRow[]> {
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .select(["printingId", "face", imageId("ci").as("imageId")])
        .where("isActive", "=", true)
        .where(sql`${imageId("ci")}`, "is not", null)
        .orderBy("printingId")
        .orderBy("face")
        .$narrowType<{ imageId: NotNull }>()
        .execute();
    },

    /** @returns The total number of copies across all users. */
    async totalCopies(): Promise<number> {
      const result = await db
        .selectFrom("copies")
        .select(sql<string>`COUNT(*)`.as("count"))
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /**
     * A cheap content-version token for the assembled catalog, used to keep the
     * dynamic list-rule expansion memo fresh (ADR-034). It folds together a
     * `count(*)` plus the latest mutation timestamp of every table that feeds the
     * server-assembled `Printing[]` — so any admin edit that can change rule
     * output (a card/printing/set field, a ban or errata added/removed, a marker
     * or channel renamed, a marker/channel link added/removed, a domain /
     * super-type / custom-tag assignment changed) rolls the token, while user
     * copy adds and price refreshes (which don't reach the `Printing[]`) leave it
     * stable. `count(*)` catches inserts/deletes; `max(updated_at)` (or
     * `created_at` for the append-only ban/errata tables) catches in-place edits.
     * `filterCards` reads only coarse facts from bans/errata (presence) and slugs
     * from markers/channels, so the per-row note/reason columns that lack
     * `updated_at` cannot change the result and need not be probed.
     *
     * The domain / super-type / custom-tag *assignment* junction tables carry no
     * timestamp, and a same-cardinality swap (delete one + insert one) leaves
     * `count(*)` unchanged — so those are content-hashed (`md5(string_agg(...))`)
     * instead. `cards.updated_at` is not bumped on a domain/super-type edit (only
     * the junction rows change), so without these hashes the memo would serve a
     * stale card set for any rule filtering on a domain, super-type, or custom
     * tag. The hashes are over the junctions only (a few thousand rows at ADR-009
     * scale); `custom_tags` slug renames are caught by its own `updated_at`.
     *
     * `current_date` is folded in **here only**, because the assembled
     * `Printing[]` this memo guards carries `setReleased`, derived from the
     * per-language release dates rather than stored (migration 233). Without it
     * a set whose date passed at midnight would keep evaluating as unreleased
     * until some unrelated admin edit happened to roll the token.
     *
     * {@link catalogResponseVersion} deliberately does NOT inherit that term:
     * the catalog *response* carries no date-derived field (`CatalogSetRow` has
     * no `released` boolean on purpose, so clients derive it from the raw
     * dates), so its bytes are identical either side of midnight.
     *
     * Far cheaper than the full assembly (aggregates only, no row materialization
     * or map building), so it can run on every ruled-list read.
     * @returns An opaque string that changes iff the rule-relevant catalog changes.
     */
    catalogContentVersion(): Promise<string> {
      return hashedToken(db, sql`${STORED_CATALOG_AGGREGATES} || '|' || current_date::text`);
    },

    /**
     * The content version of the assembled `/catalog` **response**, used as that
     * response's ETag (see `routes/public/catalog.ts`).
     *
     * This is the shared stored-catalog aggregates plus what the rule memo does
     * not need but the response carries:
     *
     * - `printing_images` — the response embeds each printing's `images`.
     * - `copies` — the response carries `totalCopies`.
     * - `printing_markers` / `printing_distribution_channels` — content-hashed,
     *   not counted. Both are timestamp-less junctions, so a same-cardinality
     *   swap (drop one link, add another) leaves `count(*)` identical and would
     *   not roll the token, while every printing's `markers` and
     *   `distributionChannels` in the response changed. The rule token counts
     *   them only, which is why they are restated here rather than shared.
     *   `printing_markers` is *also* covered indirectly — its `_sync_iud`
     *   trigger denormalizes slugs onto `printings`, bumping that row's
     *   `updated_at` — but hashing it directly keeps the guarantee from resting
     *   on a trigger side effect. `printing_distribution_channels` has no such
     *   trigger and was genuinely uncovered until this hash.
     *
     * It shares the stored aggregates rather than restating them, because the
     * failure mode of drifting out of sync is severe here: this token gates a
     * year-long `immutable` entry, so anything reachable in `CatalogResponse`
     * that it misses gets served stale to every client holding that URL.
     * `assembleCatalogResponse`'s inputs are the checklist, and
     * `catalog-response-version.integration.test.ts` mutates each of them to
     * enforce it.
     *
     * Notably absent: `current_date`. Carrying it would roll this token at every
     * UTC midnight and throw away every client's `immutable` entry daily, while
     * the response bytes did not change at all.
     *
     * @returns An opaque string that changes iff the catalog response changes.
     */
    async catalogResponseVersion(): Promise<string> {
      const [storedToken, result] = await Promise.all([
        hashedToken(db, STORED_CATALOG_AGGREGATES),
        sql<{ token: string }>`
          SELECT md5(
            coalesce((SELECT count(*) FROM printing_images)::text, '') || ':' ||
            coalesce((SELECT max(updated_at) AT TIME ZONE 'UTC' FROM printing_images)::text, '') || '|' ||
            coalesce((SELECT count(*) FROM copies)::text, '') || '|' ||
            coalesce((SELECT md5(string_agg(
              printing_id::text || ':' || marker_id::text, ',' ORDER BY printing_id, marker_id
            )) FROM printing_markers), '') || '|' ||
            coalesce((SELECT md5(string_agg(
              printing_id::text || ':' || channel_id::text || ':' || coalesce(distribution_note, ''),
              ',' ORDER BY printing_id, channel_id
            )) FROM printing_distribution_channels), '')
          ) AS token
        `.execute(db),
      ]);
      // Both halves are already md5 hex, so joining them needs no hashing here
      // and yields a value safe in both an ETag header and a `?v=` query param.
      // The raw aggregates carry timestamps (spaces, `+`) and would need
      // escaping in both places.
      return `${storedToken}${result.rows[0]?.token ?? ""}`;
    },

    /**
     * Counts and a sampled list of front-face thumbnails for the public
     * landing page. Battlefield cards are excluded from the thumbnail sample
     * (they're landscape and look wrong in the scatter). The sample is
     * deterministic per UTC day — `md5(printing_id || current_date)` — so an
     * edge cache can serve the same payload to every visitor for the day,
     * with the scatter rotating once at midnight.
     *
     * @param sampleSize — maximum number of thumbnail image IDs to return.
     * @returns Distinct card count, total printing count, total copy count,
     *   and at most `sampleSize` thumbnail image IDs.
     */
    async landingSummary(sampleSize: number): Promise<{
      cardCount: number;
      printingCount: number;
      copyCount: number;
      thumbnailIds: string[];
    }> {
      const [cardCountRow, printingCountRow, copyCountRow, thumbnailRows] = await Promise.all([
        db
          .selectFrom("cards")
          .select(sql<string>`COUNT(*)`.as("count"))
          .executeTakeFirstOrThrow(),
        db
          .selectFrom("printings")
          .select(sql<string>`COUNT(*)`.as("count"))
          .executeTakeFirstOrThrow(),
        db
          .selectFrom("copies")
          .select(sql<string>`COUNT(*)`.as("count"))
          .executeTakeFirstOrThrow(),
        db
          .selectFrom("printingImages")
          .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
          .innerJoin("printings", "printings.id", "printingImages.printingId")
          .innerJoin("cards", "cards.id", "printings.cardId")
          .select(imageId("ci").as("imageId"))
          .where("printingImages.face", "=", "front")
          .where("printingImages.isActive", "=", true)
          .where(sql`${imageId("ci")}`, "is not", null)
          .where("cards.type", "!=", WellKnown.cardType.BATTLEFIELD)
          // EN only: the landing hero shows these large, and mixed-language
          // card faces read as noise to first-time visitors.
          .where("printings.language", "=", WellKnown.language.EN)
          .orderBy(sql`md5(printing_images.printing_id::text || current_date::text)`)
          .limit(sampleSize)
          .$narrowType<{ imageId: NotNull }>()
          .execute(),
      ]);
      return {
        cardCount: Number(cardCountRow.count),
        printingCount: Number(printingCountRow.count),
        copyCount: Number(copyCountRow.count),
        thumbnailIds: thumbnailRows.map((r) => r.imageId),
      };
    },

    /** @returns The card's `id`, or `undefined` if not found. */
    cardById(id: string): Promise<Pick<Selectable<CardsTable>, "id"> | undefined> {
      return db.selectFrom("cards").select("id").where("id", "=", id).executeTakeFirst();
    },

    /** @returns The printing's `id`, or `undefined` if not found. */
    printingById(id: string): Promise<Pick<Selectable<PrintingsTable>, "id"> | undefined> {
      return db.selectFrom("printings").select("id").where("id", "=", id).executeTakeFirst();
    },

    /** @returns A single card by slug, or `undefined` if not found. */
    cardBySlug(slug: string): Promise<CatalogCardRow | undefined> {
      return db
        .selectFrom("cards")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "cards.id")
        .select([
          "cards.id",
          "cards.slug",
          "cards.name",
          "cards.type",
          "cards.might",
          "cards.energy",
          "cards.power",
          "cards.mightBonus",
          "cards.keywords",
          "cards.tags",
          "cards.maxCopiesOverride",
          "cards.comment",
          "mca.domains",
          "mca.superTypes",
          "mca.tokenCardIds",
          "mca.types",
        ])
        .where("cards.slug", "=", slug)
        .$narrowType<CardAggregateNarrowing>()
        .executeTakeFirst();
    },

    /**
     * @returns All printings for a given card ID in canonical order.
     * `printings[0]` is the canonical default printing for SSR meta tags
     * and the UI's initially-selected printing.
     *
     * The ordering expression mirrors the `printings_ordered` view, but the
     * row_number is computed only over the matching subset so the
     * `idx_printings_card_id` index can be used. `canonicalRank` is therefore
     * per-card monotonic (1, 2, 3 …) — consumers only use it as a within-card
     * tiebreaker, so the smaller values are semantically equivalent.
     */
    printingsByCardId(cardId: string): Promise<CatalogPrintingRow[]> {
      return db
        .selectFrom("printings as p")
        .innerJoin("sets as s", "s.id", "p.setId")
        .innerJoin("finishes as f", "f.slug", "p.finish")
        .innerJoin("cardSizes as cs", "cs.slug", "p.size")
        .innerJoin("languages as l", "l.code", "p.language")
        .select([
          "p.id",
          "p.cardId",
          "p.setId",
          "p.shortCode",
          "p.rarity",
          "p.artVariant",
          "p.isSigned",
          "p.finish",
          "p.size",
          "p.artist",
          "p.publicCode",
          "p.printedRulesText",
          "p.printedEffectText",
          "p.flavorText",
          "p.printedName",
          "p.printedYear",
          "p.language",
          "p.markerSlugs",
          "p.comment",
          "p.fallbackArtMode",
          fallbackImageId("p"),
          sql<number>`(row_number() OVER (
            ORDER BY
              l.sort_order,
              s.sort_order,
              p.short_code,
              array_length(p.marker_slugs, 1) IS NOT NULL,
              COALESCE(
                (SELECT MIN(m.sort_order) FROM markers m
                 WHERE m.slug = ANY(p.marker_slugs)),
                0
              ),
              f.sort_order,
              cs.sort_order
          ))::int`.as("canonicalRank"),
        ])
        .where("p.cardId", "=", cardId)
        .orderBy("canonicalRank")
        .execute();
    },

    /** @returns Printing images for a given card's printings. */
    printingImagesByCardId(cardId: string): Promise<CatalogPrintingImageRow[]> {
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .select(["printingImages.printingId", "printingImages.face", imageId("ci").as("imageId")])
        .where("printings.cardId", "=", cardId)
        .where("printingImages.isActive", "=", true)
        .where(sql`${imageId("ci")}`, "is not", null)
        .orderBy("printingImages.printingId")
        .orderBy("printingImages.face")
        .$narrowType<{ imageId: NotNull }>()
        .execute();
    },

    /** @returns Active bans for a single card. */
    cardBansByCardId(cardId: string): Promise<CatalogCardBanRow[]> {
      return db
        .selectFrom("cardBans")
        .innerJoin("formats", "formats.id", "cardBans.formatId")
        .select([
          "cardBans.cardId",
          "cardBans.formatId",
          "cardBans.bannedAt",
          "cardBans.reason",
          "formats.name as formatName",
        ])
        .where("cardBans.cardId", "=", cardId)
        .where("unbannedAt", "is", null)
        .execute();
    },

    /** @returns Errata for a single card, or `undefined`. */
    cardErrataByCardId(cardId: string): Promise<CatalogCardErrataRow | undefined> {
      return db
        .selectFrom("cardErrata")
        .select([
          "cardId",
          "correctedRulesText",
          "correctedEffectText",
          "source",
          "sourceUrl",
          "effectiveDate",
        ])
        .where("cardId", "=", cardId)
        .executeTakeFirst();
    },

    /** @returns Sets matching the given IDs. */
    async setsByIds(ids: string[]): Promise<CatalogSetRow[]> {
      if (ids.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("sets")
        .select(["id", "slug", "name", "setType", releasesJson()])
        .where("id", "in", ids)
        .orderBy("sortOrder")
        .execute();
      return rows;
    },

    /** @returns A single set by slug, or `undefined`. */
    async setBySlug(slug: string): Promise<CatalogSetRow | undefined> {
      return await db
        .selectFrom("sets")
        .select(["id", "slug", "name", "setType", releasesJson()])
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    /** @returns All printings for a given set ID in canonical order. */
    printingsBySetId(setId: string): Promise<CatalogPrintingRow[]> {
      return db
        .selectFrom("printingsOrdered")
        .select(PRINTING_VIEW_COLUMNS)
        .where("printingsOrdered.setId", "=", setId)
        .orderBy("printingsOrdered.canonicalRank")
        .execute();
    },

    /** @returns Printings matching the given IDs, in canonical order. */
    printingsByIds(ids: string[]): Promise<CatalogPrintingRow[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingsOrdered")
        .select(PRINTING_VIEW_COLUMNS)
        .where("printingsOrdered.id", "in", ids)
        .orderBy("printingsOrdered.canonicalRank")
        .execute();
    },

    /** @returns Cards matching the given IDs. */
    cardsByIds(ids: string[]): Promise<CatalogCardRow[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("cards")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "cards.id")
        .select([
          "cards.id",
          "cards.slug",
          "cards.name",
          "cards.type",
          "cards.might",
          "cards.energy",
          "cards.power",
          "cards.mightBonus",
          "cards.keywords",
          "cards.tags",
          "cards.maxCopiesOverride",
          "cards.comment",
          "mca.domains",
          "mca.superTypes",
          "mca.tokenCardIds",
          "mca.types",
        ])
        .where("cards.id", "in", ids)
        .orderBy("cards.name")
        .$narrowType<CardAggregateNarrowing>()
        .execute();
    },

    /** @returns Printing images for a given set's printings. */
    printingImagesBySetId(setId: string): Promise<CatalogPrintingImageRow[]> {
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .select(["printingImages.printingId", "printingImages.face", imageId("ci").as("imageId")])
        .where("printings.setId", "=", setId)
        .where("printingImages.isActive", "=", true)
        .where(sql`${imageId("ci")}`, "is not", null)
        .orderBy("printingImages.printingId")
        .orderBy("printingImages.face")
        .$narrowType<{ imageId: NotNull }>()
        .execute();
    },

    /**
     * Every active front-face render the scanner's embedding bank indexes,
     * with the identity fields the scan labels carry. One row per image file;
     * `createdAt` is the printing image's creation time (the bank watermark
     * is the maximum over the built set).
     *
     * @returns One row per catalogued front render.
     */
    scanReferences(): Promise<ScanReferenceRow[]> {
      return (
        db
          .selectFrom("printingImages")
          .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
          .innerJoin("printings", "printings.id", "printingImages.printingId")
          .innerJoin("cards", "cards.id", "printings.cardId")
          .innerJoin("sets", "sets.id", "printings.setId")
          .select([
            imageId("ci").as("imageId"),
            "cards.name",
            "sets.slug as setSlug",
            "printings.publicCode",
            "printings.language",
            "cards.type as cardType",
            "printings.artVariant",
            "printingImages.createdAt",
            // Window aggregates run before distinctOn collapses the shared
            // images, so min/max span every printing sharing the render;
            // equal min and max means the image's marker set is unanimous.
            sql<string>`min(array_to_string(printings.marker_slugs, '+')) over (partition by ${imageId("ci")})`.as(
              "markersMin",
            ),
            sql<string>`max(array_to_string(printings.marker_slugs, '+')) over (partition by ${imageId("ci")})`.as(
              "markersMax",
            ),
          ])
          .where("printingImages.face", "=", "front")
          .where("printingImages.isActive", "=", true)
          .where(sql`${imageId("ci")}`, "is not", null)
          // Printings can share one image file; the bank must carry each
          // render exactly once (duplicate keys would crowd the verification
          // shortlist). The printing id breaks ties deterministically.
          .distinctOn(imageId("ci"))
          .orderBy(imageId("ci"))
          .orderBy("printings.id")
          .$narrowType<{ imageId: NotNull }>()
          .execute()
      );
    },

    /** @returns The image_files.id of a cover image per set (first available printing image). */
    async setCoverImageIds(): Promise<Map<string, string>> {
      const rows = await db
        .selectFrom("printings")
        .innerJoin("printingImages", "printingImages.printingId", "printings.id")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .select(["printings.setId", imageId("ci").as("imageId")])
        .where("printingImages.isActive", "=", true)
        .where("printingImages.face", "=", "front")
        .where(sql`${imageId("ci")}`, "is not", null)
        .distinctOn("printings.setId")
        .orderBy("printings.setId")
        .orderBy(sql`(printings.language = ${WellKnown.language.EN}) DESC`)
        .orderBy("printings.shortCode")
        .$narrowType<{ imageId: NotNull }>()
        .execute();
      return new Map(rows.map((r) => [r.setId, r.imageId]));
    },

    /**
     * Card count and printing count per set, in a single query.
     *
     * @returns A map from set ID to `{ cardCount, printingCount }`.
     */
    async setCountsAll(): Promise<Map<string, { cardCount: number; printingCount: number }>> {
      const rows = await db
        .selectFrom("printings")
        .select([
          "setId",
          sql<string>`COUNT(DISTINCT "card_id")`.as("cardCount"),
          sql<string>`COUNT(*)`.as("printingCount"),
        ])
        .groupBy("setId")
        .execute();
      return new Map(
        rows.map((r) => [
          r.setId,
          { cardCount: Number(r.cardCount), printingCount: Number(r.printingCount) },
        ]),
      );
    },

    /** @returns All markers, ordered by sort order then label. */
    markersList(): Promise<
      { id: string; slug: string; label: string; description: string | null }[]
    > {
      return db
        .selectFrom("markers")
        .select(["id", "slug", "label", "description"])
        .orderBy("sortOrder")
        .orderBy("label")
        .execute();
    },

    /** @returns Active printing images for a list of printing IDs. */
    printingImagesByPrintingIds(printingIds: string[]): Promise<CatalogPrintingImageRow[]> {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .select(["printingImages.printingId", "printingImages.face", imageId("ci").as("imageId")])
        .where("printingImages.printingId", "in", printingIds)
        .where("printingImages.isActive", "=", true)
        .where(sql`${imageId("ci")}`, "is not", null)
        .orderBy("printingImages.printingId")
        .orderBy("printingImages.face")
        .$narrowType<{ imageId: NotNull }>()
        .execute();
    },

    /**
     * @returns All printings distributed through at least one channel (event or
     * product), in canonical order.
     */
    channelDistributedPrintings(): Promise<CatalogPrintingRow[]> {
      return db
        .selectFrom("printingsOrdered")
        .select(PRINTING_VIEW_COLUMNS)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("printingDistributionChannels as pdc")
              .select(sql`1`.as("one"))
              .whereRef("pdc.printingId", "=", "printingsOrdered.id"),
          ),
        )
        .orderBy("printingsOrdered.canonicalRank")
        .execute();
    },

    /** @returns All card sitemap entries (slug + updatedAt). */
    async allCardSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
      const rows = await db
        .selectFrom("cards")
        .select(["slug", "updatedAt"])
        .orderBy("name")
        .execute();
      return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
    },

    /** @returns All set sitemap entries (slug + updatedAt). */
    async allSetSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
      const rows = await db
        .selectFrom("sets")
        .select(["slug", "updatedAt"])
        .orderBy("sortOrder")
        .execute();
      return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
    },

    /**
     * Refresh the `mv_card_aggregates` materialized view.
     * Uses CONCURRENTLY so reads aren't blocked during refresh.
     *
     * @returns void
     */
    async refreshCardAggregates(): Promise<void> {
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_card_aggregates`.execute(db);
    },

    /**
     * Refresh `mv_printings_canonical_rank`, which backs the
     * `printings_ordered` view's `canonical_rank` (migration 215).
     *
     * Must run after anything that changes the ranking: printings themselves,
     * or the `sort_order` of sets / finishes / card_sizes / languages /
     * markers. Until it does, a new printing coalesces to the largest int and
     * sorts last rather than disappearing, so a missed refresh delays ordering
     * instead of hiding cards.
     *
     * @returns void
     */
    async refreshCanonicalRank(): Promise<void> {
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_printings_canonical_rank`.execute(db);
    },

    /**
     * Refresh every materialized view derived from the card/printing catalog.
     * Card and printing mutations invalidate both of them, so they refresh
     * together rather than leaving callers to remember the pair.
     *
     * @returns void
     */
    async refreshCatalogViews(): Promise<void> {
      // Not `this.refresh…()`: instrumentRepo rebinds these methods onto a new
      // object, so a `this` reference here would not survive the wrapping.
      await Promise.all([
        sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_card_aggregates`.execute(db),
        sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_printings_canonical_rank`.execute(db),
      ]);
    },
  };
}
