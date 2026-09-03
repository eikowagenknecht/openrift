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

// The landing thumbnails' price. Cardmarket is the euro feed with the widest
// printing coverage, and the vignettes that show a price render it in euros.
const PRICE_MARKETPLACE = "cardmarket";

// Printings priced inside this band sort ahead of the rest of the sample. Most
// of the catalog sits at two cents, and a scanner tray totalling six of them
// reads as a broken price feed; the chase printings above the band read as a
// staged flex instead of a session anyone could have.
export const PRICE_BAND_CENTS = { min: 50, max: 2000 };

// How many channel labels a sampled promo section may carry. The deep tournament
// branches spend a whole line on their breadcrumb alone.
const PROMO_MAX_CHANNEL_DEPTH = 2;

// Rotation step for the legend sample, matching the `current_date` the rest of
// the landing samples shuffle on.
const DAY_MS = 86_400_000;

/** One sampled printing inside a {@link LandingPromoSection}. */
interface LandingPromoPrinting {
  imageId: string;
  name: string;
  shortCode: string;
  rarity: string;
  /** Marker labels, in the markers' own display order. Empty for most channels. */
  markers: string[];
}

/** A distribution channel and a few of the printings handed out through it. */
export interface LandingPromoSection {
  /** Channel labels from the root down to the channel itself. */
  path: string[];
  /** Printings in the channel, not the number sampled here. */
  printingCount: number;
  printings: LandingPromoPrinting[];
}

type PromoSectionRow = Omit<LandingPromoSection, "printings"> &
  LandingPromoPrinting & { sortKey: string };

export type CatalogCardRow = Omit<
  Selectable<CardsTable>,
  "normName" | "createdAt" | "updatedAt"
> & {
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

/** One row of `relatedCards`, already shaped for the card-detail `related` strip. */
export interface RelatedCardRow {
  slug: string;
  name: string;
  types: CardType[];
  domains: Domain[];
  rarity: string | null;
  imageId: string | null;
}

type CatalogCardBanRow = Pick<
  Selectable<CardBansTable>,
  "cardId" | "formatId" | "bannedAt" | "reason"
> & { formatName: string };

type CatalogCardErrataRow = Pick<
  Selectable<CardErrataTable>,
  "cardId" | "correctedRulesText" | "correctedEffectText" | "source" | "sourceUrl" | "effectiveDate"
>;

/**
 * No `released` boolean on purpose: clients derive it from the dates via
 * `isReleased`, so a cached response can't claim a set is still upcoming a
 * week after its date passed.
 */
type CatalogSetRow = Pick<Selectable<SetsTable>, "id" | "slug" | "name" | "setType"> & {
  releases: SetReleases;
};

type PrintingCodeRow = Pick<Selectable<PrintingsTable>, "cardId" | "shortCode" | "publicCode">;

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
  isOvernumbered: boolean;
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
 * Printing row returned by the catalog. Marker metadata (label/description)
 * and distribution channels are resolved separately by the route layer using
 * the catalog's `markersList()` and the distribution-channels repo.
 *
 * `canonicalRank` is the integer sort key from the `printings_ordered` view.
 * Clients sort by this integer and get language-first, set-order, shortCode,
 * non-promo-first, finish-sort-order semantics in one compare. User language
 * preference overrides the language axis post-query.
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

/**
 * Shared by every read that returns a {@link CatalogCardRow}, so a column
 * added to the contract reaches all of them at once.
 */
const CARD_COLUMNS = [
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
] as const;

/** Selecting from `printings_ordered` (the view) so we get `canonical_rank` too. */
const PRINTING_VIEW_COLUMNS = [
  "printingsOrdered.id",
  "printingsOrdered.cardId",
  "printingsOrdered.setId",
  "printingsOrdered.shortCode",
  "printingsOrdered.rarity",
  "printingsOrdered.artVariant",
  "printingsOrdered.isSigned",
  "printingsOrdered.isOvernumbered",
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
 * reads stay one round trip.
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

function selectCardBans(db: Kysely<Database>) {
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
    .where("unbannedAt", "is", null);
}

function selectCardErrata(db: Kysely<Database>) {
  return db
    .selectFrom("cardErrata")
    .select([
      "cardId",
      "correctedRulesText",
      "correctedEffectText",
      "source",
      "sourceUrl",
      "effectiveDate",
    ]);
}

/**
 * External-only rows are excluded here rather than at the call sites, so a
 * page can never be handed an image it has no URL for.
 */
function selectPrintingImages(db: Kysely<Database>) {
  return db
    .selectFrom("printingImages")
    .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
    .select(["printingImages.printingId", "printingImages.face", imageId("ci").as("imageId")])
    .where("printingImages.isActive", "=", true)
    .where(sql`${imageId("ci")}`, "is not", null)
    .orderBy("printingImages.printingId")
    .orderBy("printingImages.face")
    .$narrowType<{ imageId: NotNull }>();
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

async function hashedToken(db: Kysely<Database>, expression: RawBuilder<string>): Promise<string> {
  const result = await sql<{ token: string }>`SELECT md5(${expression}) AS token`.execute(db);
  return result.rows[0]?.token ?? "";
}

/**
 * The `.select()` columns in each method define the public API contract —
 * the catalog route spreads these rows directly into the response. Only
 * select columns that are safe to expose to clients.
 */
export function catalogRepo(db: Kysely<Database>) {
  return {
    async sets(): Promise<CatalogSetRow[]> {
      const rows = await db
        .selectFrom("sets")
        .select(["id", "slug", "name", "setType", releasesJson()])
        .orderBy("sortOrder")
        .execute();
      return rows;
    },

    /**
     * Distinct `cards.tags` values appearing on Legend cards. Each Legend has
     * exactly one tag (the champion's name), so this is the canonical set of
     * champion-identifier tags — used by Custom-Region to tell champion-name
     * tags apart from region/utility tags during deck validation.
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

    cards(): Promise<CatalogCardRow[]> {
      return db
        .selectFrom("cards")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "cards.id")
        .select(CARD_COLUMNS)
        .orderBy("cards.name")
        .$narrowType<CardAggregateNarrowing>()
        .execute();
    },

    /**
     * Canonical names for a batch of card ids. Missing ids are simply absent,
     * so a caller validating input can compare sizes.
     */
    async cardNamesByIds(cardIds: readonly string[]): Promise<Map<string, string>> {
      if (cardIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("cards")
        .select(["id", "name"])
        .where("id", "in", [...cardIds])
        .execute();
      return new Map(rows.map((row) => [row.id, row.name]));
    },

    cardBans(): Promise<CatalogCardBanRow[]> {
      return selectCardBans(db).execute();
    },

    cardErrata(): Promise<CatalogCardErrataRow[]> {
      return selectCardErrata(db).execute();
    },

    cardBansByCardIds(cardIds: string[]): Promise<CatalogCardBanRow[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return selectCardBans(db).where("cardBans.cardId", "in", cardIds).execute();
    },

    cardErrataByCardIds(cardIds: string[]): Promise<CatalogCardErrataRow[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return selectCardErrata(db).where("cardId", "in", cardIds).execute();
    },

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
     */
    printingCodes(): Promise<PrintingCodeRow[]> {
      return db
        .selectFrom("printings")
        .select(["cardId", "shortCode", "publicCode"])
        .orderBy("shortCode")
        .execute();
    },

    /**
     * The curated name aliases, for the server-side lookup index.
     *
     * Only the normalized key is stored, never the original spelling, so these
     * feed `SearchableCard.altNames` as already-squashed strings. Aliases are
     * written alongside the card rows that own them, so `catalogContentVersion`
     * moves whenever they do and no separate probe is needed.
     */
    nameAliases(): Promise<{ cardId: string; normName: string }[]> {
      return db
        .selectFrom("cardNameAliases")
        .select(["cardId", "normName"])
        .orderBy("normName")
        .execute();
    },

    printingImages(): Promise<CatalogPrintingImageRow[]> {
      return selectPrintingImages(db).execute();
    },

    async totalCopies(): Promise<number> {
      const result = await db
        .selectFrom("copies")
        .select(sql<string>`COUNT(*)`.as("count"))
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /**
     * A cheap content-version token for the assembled catalog, changing iff the
     * rule-relevant catalog changes; it keeps the dynamic list-rule expansion
     * memo fresh. It folds together a
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
     * tag. The hashes are over the junctions only (a few thousand rows);
     * `custom_tags` slug renames are caught by its own `updated_at`.
     *
     * `current_date` is folded in **here only**, because the assembled
     * `Printing[]` this memo guards carries `setReleased`, derived from the
     * per-language release dates rather than stored. Without it
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
     * - `printing_citations` — content-hashed for the same reason: the table
     *   has no `updated_at`, and editing a citation's label or URL in place
     *   leaves every count identical while the response text changes.
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
            )) FROM printing_distribution_channels), '') || '|' ||
            coalesce((SELECT md5(string_agg(
              id::text || ':' || label || ':' || coalesce(source_url, '') || ':' || sort_order::text,
              ',' ORDER BY id
            )) FROM printing_citations), '')
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
     * Each thumbnail carries the printing's own identity (name, code, variant
     * label, Cardmarket price) so the marketing vignettes can label the card
     * they are showing instead of inventing one. Printings priced inside
     * {@link PRICE_BAND_CENTS} sort first, since the vignettes that show a
     * price read the head of the sample.
     */
    async landingSummary(sampleSize: number): Promise<{
      cardCount: number;
      printingCount: number;
      copyCount: number;
      thumbnails: {
        imageId: string;
        rarity: string;
        domains: string[];
        name: string;
        shortCode: string;
        variantLabel: string | null;
        priceCents: number | null;
      }[];
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
          .leftJoin("finishes as fin", "fin.slug", "printings.finish")
          .leftJoin("artVariants as av", "av.slug", "printings.artVariant")
          .leftJoin("mvLatestPrintingPrices as pr", (join) =>
            join
              .onRef("pr.printingId", "=", "printings.id")
              .on("pr.marketplace", "=", PRICE_MARKETPLACE),
          )
          .select([
            imageId("ci").as("imageId"),
            "printings.rarity as rarity",
            "cards.name as name",
            "printings.shortCode as shortCode",
            "pr.headlineCents as priceCents",
            sql<
              string[]
            >`coalesce((select array_agg(cd.domain_slug order by cd.ordinal) from card_domains cd where cd.card_id = cards.id), '{}')`.as(
              "domains",
            ),
            sql<string | null>`nullif(
              concat_ws(
                ' · ',
                case when printings.art_variant <> ${WellKnown.artVariant.NORMAL} then av.label end,
                case when printings.is_overnumbered then 'Overnumbered' end,
                case when printings.finish <> ${WellKnown.finish.NORMAL} then fin.label end
              ),
              ''
            )`.as("variantLabel"),
          ])
          .where("printingImages.face", "=", "front")
          .where("printingImages.isActive", "=", true)
          .where(sql`${imageId("ci")}`, "is not", null)
          .where("cards.type", "!=", WellKnown.cardType.BATTLEFIELD)
          // EN only: the landing hero shows these large, and mixed-language
          // card faces read as noise to first-time visitors.
          .where("printings.language", "=", WellKnown.language.EN)
          .orderBy(
            sql`coalesce(pr.headline_cents, 0) not between ${PRICE_BAND_CENTS.min} and ${PRICE_BAND_CENTS.max}`,
          )
          .orderBy(sql`md5(printing_images.printing_id::text || current_date::text)`)
          .limit(sampleSize)
          .$narrowType<{ imageId: NotNull }>()
          .execute(),
      ]);
      return {
        cardCount: Number(cardCountRow.count),
        printingCount: Number(printingCountRow.count),
        copyCount: Number(copyCountRow.count),
        thumbnails: thumbnailRows.map((r) => ({
          imageId: r.imageId,
          rarity: r.rarity,
          domains: r.domains,
          name: r.name,
          shortCode: r.shortCode,
          variantLabel: r.variantLabel,
          priceCents: r.priceCents,
        })),
      };
    },

    /**
     * A per-UTC-day sample of Legend art for the tier-list vignette, which
     * ranks legends and so cannot use the general thumbnail sample.
     *
     * One printing per card: a legend with several printings would otherwise
     * fill the miniature's board with the same face more than once.
     *
     * @returns Image ids, at most `sampleSize` of them.
     */
    async landingLegendThumbnails(sampleSize: number): Promise<string[]> {
      const rows = await db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .innerJoin("cards", "cards.id", "printings.cardId")
        .select([imageId("ci").as("imageId"), "cards.id as cardId"])
        .where("printingImages.face", "=", "front")
        .where("printingImages.isActive", "=", true)
        .where(sql`${imageId("ci")}`, "is not", null)
        .where("cards.type", "=", WellKnown.cardType.LEGEND)
        // EN only, for the same reason the general sample is EN only: mixed
        // language faces read as noise in a miniature.
        .where("printings.language", "=", WellKnown.language.EN)
        // DISTINCT ON has to be ordered by its own key first, so this picks the
        // day's printing within each card but leaves the cards in id order.
        .distinctOn("cards.id")
        .orderBy("cards.id")
        .orderBy(sql`md5(printing_images.printing_id::text || current_date::text)`)
        .$narrowType<{ imageId: NotNull }>()
        .execute();
      // Which legends the sample lands on is therefore a JS step: rotate the
      // id-ordered list by the day so the board is stable within a day and
      // works through the whole pool across a set, without a second query to
      // re-shuffle what DISTINCT ON already ordered.
      if (rows.length === 0) {
        return [];
      }
      const offset = Math.floor(Date.now() / DAY_MS) % rows.length;
      return [...rows.slice(offset), ...rows.slice(0, offset)]
        .slice(0, sampleSize)
        .map((row) => row.imageId);
    },

    /**
     * A per-UTC-day sample of real distribution channels for the promos
     * vignette: the channel's breadcrumb, how many printings it holds, and a
     * few of those printings with their markers. Channels deeper than
     * {@link PROMO_MAX_CHANNEL_DEPTH} are skipped, because their breadcrumb is
     * longer than the miniature's section divider can carry.
     *
     * The sample leads with printings that carry markers, and a channel needs
     * enough of them to fill its section, since the marker chips are what the
     * vignette is demonstrating. `printingCount` still counts the whole
     * channel, markers or not.
     */
    async landingPromoSections(
      sectionCount: number,
      perSection: number,
    ): Promise<LandingPromoSection[]> {
      const result = await sql<PromoSectionRow>`
        WITH RECURSIVE channel_paths AS (
          SELECT id, ARRAY[label] AS path, 1 AS depth
          FROM distribution_channels
          WHERE parent_id IS NULL
          UNION ALL
          SELECT c.id, cp.path || c.label, cp.depth + 1
          FROM distribution_channels c
          JOIN channel_paths cp ON cp.id = c.parent_id
        ),
        channel_printings AS (
          SELECT pdc.channel_id, p.id AS printing_id, f.id AS image_id,
                 c.name, p.short_code, p.rarity, p.marker_slugs
          FROM printing_distribution_channels pdc
          JOIN printings p ON p.id = pdc.printing_id
          JOIN cards c ON c.id = p.card_id
          JOIN printing_images pi
            ON pi.printing_id = p.id AND pi.face = 'front' AND pi.is_active
          JOIN image_files f ON f.id = pi.image_file_id AND f.rehosted_url IS NOT NULL
          WHERE p.language = ${WellKnown.language.EN}
            AND c.type <> ${WellKnown.cardType.BATTLEFIELD}
        ),
        sections AS (
          SELECT cp.id, cp.path, count(*)::int AS printing_count,
                 md5(cp.id::text || current_date::text) AS sort_key
          FROM channel_printings chp
          JOIN channel_paths cp
            ON cp.id = chp.channel_id AND cp.depth <= ${PROMO_MAX_CHANNEL_DEPTH}
          GROUP BY cp.id, cp.path
          HAVING count(*) FILTER (WHERE chp.marker_slugs <> '{}') >= ${perSection}
          ORDER BY sort_key
          LIMIT ${sectionCount}
        ),
        ranked AS (
          SELECT s.sort_key, s.path, s.printing_count, chp.image_id, chp.name,
                 chp.short_code, chp.rarity,
                 coalesce((
                   SELECT array_agg(m.label ORDER BY m.sort_order)
                   FROM markers m WHERE m.slug = ANY(chp.marker_slugs)
                 ), '{}') AS markers,
                 row_number() OVER (
                   PARTITION BY s.id
                   ORDER BY chp.marker_slugs = '{}',
                            md5(chp.printing_id::text || current_date::text)
                 ) AS rn
          FROM sections s
          JOIN channel_printings chp ON chp.channel_id = s.id
        )
        SELECT sort_key AS "sortKey", path, printing_count AS "printingCount",
               image_id AS "imageId", name, short_code AS "shortCode", rarity, markers
        FROM ranked
        WHERE rn <= ${perSection}
        ORDER BY sort_key, rn
      `.execute(db);

      const sections = new Map<string, LandingPromoSection>();
      for (const row of result.rows) {
        let section = sections.get(row.sortKey);
        if (!section) {
          section = { path: row.path, printingCount: row.printingCount, printings: [] };
          sections.set(row.sortKey, section);
        }
        section.printings.push({
          imageId: row.imageId,
          name: row.name,
          shortCode: row.shortCode,
          rarity: row.rarity,
          markers: row.markers,
        });
      }
      return [...sections.values()];
    },

    cardById(id: string): Promise<Pick<Selectable<CardsTable>, "id"> | undefined> {
      return db.selectFrom("cards").select("id").where("id", "=", id).executeTakeFirst();
    },

    printingById(id: string): Promise<Pick<Selectable<PrintingsTable>, "id"> | undefined> {
      return db.selectFrom("printings").select("id").where("id", "=", id).executeTakeFirst();
    },

    cardBySlug(slug: string): Promise<CatalogCardRow | undefined> {
      return db
        .selectFrom("cards")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "cards.id")
        .select(CARD_COLUMNS)
        .where("cards.slug", "=", slug)
        .$narrowType<CardAggregateNarrowing>()
        .executeTakeFirst();
    },

    /**
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
          "p.isOvernumbered",
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

    printingImagesByCardId(cardId: string): Promise<CatalogPrintingImageRow[]> {
      return selectPrintingImages(db)
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .where("printings.cardId", "=", cardId)
        .execute();
    },

    /**
     * Scored related cards for the card page's "Related cards" strip.
     * Signals, strongest first: token links in either direction (a card and
     * the token it creates), then shared `cards.tags` weighted by how rare
     * the tag is (a champion tag shared by 3 cards outranks a region tag
     * shared by 80), then a same-domain/same-type filler ranked by energy
     * proximity so a vanilla card still gets a populated strip. The filler
     * caps at 0.9 — below 80/n for even the most common tag — so any real
     * shared tag always outranks a mere same-cost neighbor; a last 0.05
     * same-type-only term keeps domainless siblings (the six runes, tokens)
     * from producing an empty strip. Fully
     * deterministic (name tiebreak) — the result is embedded in the cached
     * card-detail response, so it must not shuffle between requests. Each
     * result carries the art of its canonical printing (EN-first, preferring
     * one with a rehosted image).
     */
    async relatedCards(cardId: string, limit: number): Promise<RelatedCardRow[]> {
      const result = await sql<RelatedCardRow>`
        WITH me AS (
          SELECT c.id, c.tags, c.energy, mca.domains, mca.types
          FROM cards c
          JOIN mv_card_aggregates mca ON mca.card_id = c.id
          WHERE c.id = ${cardId}
        ),
        tag_freq AS (
          SELECT t AS tag, count(*)::float8 AS n
          FROM cards, LATERAL unnest(cards.tags) AS t
          GROUP BY t
        ),
        token_links AS (
          SELECT token_card_id AS other_id FROM card_tokens WHERE card_id = ${cardId}
          UNION
          SELECT card_id FROM card_tokens WHERE token_card_id = ${cardId}
        ),
        scored AS (
          SELECT
            c.id, c.slug, c.name, mca.types, mca.domains,
            (CASE WHEN EXISTS (SELECT 1 FROM token_links tl WHERE tl.other_id = c.id)
              THEN 100.0 ELSE 0.0 END)
            + COALESCE((
                SELECT SUM(80.0 / f.n)
                FROM unnest(c.tags) AS t
                JOIN tag_freq f ON f.tag = t
                WHERE t = ANY(me.tags)
              ), 0.0)
            + (CASE WHEN mca.domains && me.domains AND mca.types && me.types
                THEN GREATEST(0.1, 0.9 - ABS(COALESCE(c.energy, 0) - COALESCE(me.energy, 0)) * 0.1)
                ELSE 0.0 END)
            + (CASE WHEN mca.types && me.types THEN 0.05 ELSE 0.0 END) AS score
          FROM cards c
          JOIN mv_card_aggregates mca ON mca.card_id = c.id
          CROSS JOIN me
          WHERE c.id <> me.id
        ),
        top_cards AS (
          SELECT * FROM scored WHERE score > 0 ORDER BY score DESC, name LIMIT ${limit}
        )
        SELECT
          top_cards.slug,
          top_cards.name,
          top_cards.types,
          top_cards.domains,
          art.rarity,
          art.image_id AS "imageId"
        FROM top_cards
        LEFT JOIN LATERAL (
          SELECT
            p.rarity,
            CASE WHEN imgf.rehosted_url IS NOT NULL THEN imgf.id ELSE NULL END AS image_id
          FROM printings p
          JOIN languages l ON l.code = p.language
          JOIN sets s ON s.id = p.set_id
          LEFT JOIN printing_images pi
            ON pi.printing_id = p.id AND pi.face = 'front' AND pi.is_active
          LEFT JOIN image_files imgf ON imgf.id = pi.image_file_id
          WHERE p.card_id = top_cards.id
          ORDER BY (imgf.rehosted_url IS NOT NULL) DESC, l.sort_order, s.sort_order, p.short_code
          LIMIT 1
        ) art ON TRUE
        ORDER BY top_cards.score DESC, top_cards.name
      `.execute(db);
      return result.rows;
    },

    cardBansByCardId(cardId: string): Promise<CatalogCardBanRow[]> {
      return selectCardBans(db).where("cardBans.cardId", "=", cardId).execute();
    },

    cardErrataByCardId(cardId: string): Promise<CatalogCardErrataRow | undefined> {
      return selectCardErrata(db).where("cardId", "=", cardId).executeTakeFirst();
    },

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

    async setBySlug(slug: string): Promise<CatalogSetRow | undefined> {
      return await db
        .selectFrom("sets")
        .select(["id", "slug", "name", "setType", releasesJson()])
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    printingsBySetId(setId: string): Promise<CatalogPrintingRow[]> {
      return db
        .selectFrom("printingsOrdered")
        .select(PRINTING_VIEW_COLUMNS)
        .where("printingsOrdered.setId", "=", setId)
        .orderBy("printingsOrdered.canonicalRank")
        .execute();
    },

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

    cardsByIds(ids: string[]): Promise<CatalogCardRow[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("cards")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "cards.id")
        .select(CARD_COLUMNS)
        .where("cards.id", "in", ids)
        .orderBy("cards.name")
        .$narrowType<CardAggregateNarrowing>()
        .execute();
    },

    printingImagesBySetId(setId: string): Promise<CatalogPrintingImageRow[]> {
      return selectPrintingImages(db)
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .where("printings.setId", "=", setId)
        .execute();
    },

    /**
     * Every active front-face render the scanner's embedding bank indexes,
     * with the identity fields the scan labels carry. One row per image file;
     * `createdAt` is the printing image's creation time (the bank watermark
     * is the maximum over the built set).
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
            "printings.isOvernumbered",
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

    printingImagesByPrintingIds(printingIds: string[]): Promise<CatalogPrintingImageRow[]> {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return selectPrintingImages(db)
        .where("printingImages.printingId", "in", printingIds)
        .execute();
    },

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

    async allCardSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
      const rows = await db
        .selectFrom("cards")
        .select(["slug", "updatedAt"])
        .orderBy("name")
        .execute();
      return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
    },

    async allSetSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
      const rows = await db
        .selectFrom("sets")
        .select(["slug", "updatedAt"])
        .orderBy("sortOrder")
        .execute();
      return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
    },

    async refreshCardAggregates(): Promise<void> {
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_card_aggregates`.execute(db);
    },

    /**
     * Refresh `mv_printings_canonical_rank`, which backs the
     * `printings_ordered` view's `canonical_rank`.
     *
     * Must run after anything that changes the ranking: printings themselves,
     * or the `sort_order` of sets / finishes / card_sizes / languages /
     * markers. Until it does, a new printing coalesces to the largest int and
     * sorts last rather than disappearing, so a missed refresh delays ordering
     * instead of hiding cards.
     */
    async refreshCanonicalRank(): Promise<void> {
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_printings_canonical_rank`.execute(db);
    },

    /**
     * Card and printing mutations invalidate both catalog-derived materialized
     * views, so they refresh together rather than leaving callers to remember
     * the pair.
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
