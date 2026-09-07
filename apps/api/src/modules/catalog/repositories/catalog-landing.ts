import { WellKnown } from "@openrift/shared/well-known";
import type { Kysely, NotNull } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import { imageId } from "../../../repositories/query-helpers.js";

const PRICE_MARKETPLACE = "cardmarket";

export const PRICE_BAND_CENTS = { min: 50, max: 2000 };

const PROMO_MAX_CHANNEL_DEPTH = 2;

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

export function catalogLandingRepo(db: Kysely<Database>) {
  return {
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
  };
}
