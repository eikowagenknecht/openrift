import type { CardType, Domain, SuperType } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { CardBansTable, CardErrataTable, CardsTable } from "../../../db/tables/catalog.js";

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
 * `mv_card_aggregates` types its slug arrays as plain `string[]`; every read
 * of it must narrow them to `Domain[]` / `SuperType[]` / `CardType[]`.
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

export function catalogCardsRepo(db: Kysely<Database>) {
  return {
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

    cardById(id: string): Promise<Pick<Selectable<CardsTable>, "id"> | undefined> {
      return db.selectFrom("cards").select("id").where("id", "=", id).executeTakeFirst();
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

    async allCardSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
      const rows = await db
        .selectFrom("cards")
        .select(["slug", "updatedAt"])
        .orderBy("name")
        .execute();
      return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString() }));
    },
  };
}
