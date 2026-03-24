import type { Kysely, Selectable, SqlBool } from "kysely";
import { sql } from "kysely";

import type {
  CardsTable,
  Database,
  PrintingImagesTable,
  PrintingsTable,
  SetsTable,
} from "../db/index.js";
import { imageUrl } from "./query-helpers.js";

/** Card columns returned by the catalog (excludes normName and timestamps). */
type CatalogCardRow = Omit<Selectable<CardsTable>, "normName" | "createdAt" | "updatedAt">;

/** Set columns returned by the catalog (id, slug, name only). */
type CatalogSetRow = Pick<Selectable<SetsTable>, "id" | "slug" | "name">;

/** Active printing image with resolved URL (null URLs filtered at query level). */
type CatalogPrintingImageRow = Pick<Selectable<PrintingImagesTable>, "printingId" | "face"> & {
  url: string;
};

/** Printing row returned by the catalog, with promoType resolved from the join. */
type CatalogPrintingRow = Omit<
  Selectable<PrintingsTable>,
  "comment" | "createdAt" | "updatedAt" | "promoTypeId"
> & {
  promoType: { id: string; slug: string; label: string } | null;
};

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
    sets(): Promise<CatalogSetRow[]> {
      return db.selectFrom("sets").select(["id", "slug", "name"]).orderBy("sortOrder").execute();
    },

    /** @returns All cards (no printings), for building a card lookup. */
    cards(): Promise<CatalogCardRow[]> {
      return db
        .selectFrom("cards")
        .select([
          "id",
          "slug",
          "name",
          "type",
          "superTypes",
          "domains",
          "might",
          "energy",
          "power",
          "mightBonus",
          "keywords",
          "rulesText",
          "effectText",
          "tags",
          "comment",
        ])
        .orderBy("name")
        .execute();
    },

    /** @returns All printings ordered by set, collector number, finish, with promoType resolved. */
    async printings(): Promise<CatalogPrintingRow[]> {
      const rows = await db
        .selectFrom("printings")
        .leftJoin("promoTypes", "promoTypes.id", "printings.promoTypeId")
        .select([
          "printings.id",
          "printings.slug",
          "printings.cardId",
          "printings.setId",
          "printings.shortCode",
          "printings.collectorNumber",
          "printings.rarity",
          "printings.artVariant",
          "printings.isSigned",
          "printings.finish",
          "printings.artist",
          "printings.publicCode",
          "printings.printedRulesText",
          "printings.printedEffectText",
          "printings.flavorText",
          "promoTypes.id as promoTypeId",
          "promoTypes.slug as promoTypeSlug",
          "promoTypes.label as promoTypeLabel",
        ])
        .orderBy("printings.setId")
        .orderBy("printings.collectorNumber")
        .orderBy("printings.finish", "desc")
        .execute();

      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        cardId: row.cardId,
        setId: row.setId,
        shortCode: row.shortCode,
        collectorNumber: row.collectorNumber,
        rarity: row.rarity,
        artVariant: row.artVariant,
        isSigned: row.isSigned,
        finish: row.finish,
        artist: row.artist,
        publicCode: row.publicCode,
        printedRulesText: row.printedRulesText,
        printedEffectText: row.printedEffectText,
        flavorText: row.flavorText,
        promoType: row.promoTypeId
          ? { id: row.promoTypeId, slug: row.promoTypeSlug ?? "", label: row.promoTypeLabel ?? "" }
          : null,
      }));
    },

    /** @returns All active printing images (front and back), ordered by printing then face. */
    printingImages(): Promise<CatalogPrintingImageRow[]> {
      return db
        .selectFrom("printingImages")
        .select(["printingId", "face", imageUrl("printingImages").as("url")])
        .where("isActive", "=", true)
        .where(sql`${imageUrl("printingImages")}`, "is not", null)
        .orderBy("printingId")
        .orderBy("face")
        .execute() as Promise<CatalogPrintingImageRow[]>;
    },

    /** @returns The printing's `id`, or `undefined` if not found. */
    printingById(id: string): Promise<Pick<Selectable<PrintingsTable>, "id"> | undefined> {
      return db.selectFrom("printings").select("id").where("id", "=", id).executeTakeFirst();
    },

    /**
     * Fix typography in printing text fields (printed_rules_text, printed_effect_text, flavor_text).
     * Replaces straight quotes, triple dots, and hyphens-before-digits with proper Unicode.
     *
     * @param dryRun When true, only count affected rows without modifying data.
     * @returns The number of rows that would be (or were) updated.
     */
    async fixTypography(dryRun: boolean): Promise<number> {
      const columns = ["printed_rules_text", "printed_effect_text", "flavor_text"] as const;

      const whereConditions = columns.map((col) => {
        const ref = sql.ref(col);
        return sql`${ref} IS DISTINCT FROM ${fixTypographyExpr(col)}`;
      });
      const where = sql.join(whereConditions, sql` OR `);

      if (dryRun) {
        const result = await db
          .selectFrom("printings")
          .select(sql<string>`COUNT(*)`.as("count"))
          .where(sql<SqlBool>`${where}`)
          .executeTakeFirstOrThrow();
        return Number(result.count);
      }

      const updates: Record<string, ReturnType<typeof fixTypographyExpr>> = {};
      for (const col of columns) {
        updates[col] = fixTypographyExpr(col);
      }

      const result = await db
        .updateTable("printings")
        .set(updates)
        .where(sql<SqlBool>`${where}`)
        .executeTakeFirst();

      return Number(result.numUpdatedRows);
    },
  };
}

// ── Typography helpers ─────────────────────────────────────────────────────

/**
 * Build a SQL expression that applies all typography fixes to the given column:
 * - Straight apostrophe (') → right single curly quote (\u2019)
 * - Triple dots (...) → horizontal ellipsis (\u2026)
 * - Paired straight double quotes ("…") → curly double quotes (\u201C…\u201D)
 * - Hyphen-minus before digit (-1) → minus sign (\u2212) before digit
 * - Parenthesized text (...) wrapped with underscores for italic rendering: _(...)_
 * @returns A Kysely raw SQL expression with chained REPLACE/REGEXP_REPLACE calls.
 */
function fixTypographyExpr(column: string) {
  const col = sql.ref(column);
  // Inner → outer: apostrophe, ellipsis, double quotes, minus sign,
  // then italic parens (strip existing wrappers first, then re-add for all).
  return sql`REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REPLACE(
            REPLACE(${col}, '''', E'\u2019'),
            '...', E'\u2026'
          ),
          '"([^"]*)"', E'\u201C\\1\u201D', 'g'
        ),
        '-([0-9])', E'\u2212\\1', 'g'
      ),
      '_\\(([^)]*)\\)_', '(\\1)', 'g'
    ),
    '\\(([^)]*)\\)', '_(\\1)_', 'g'
  )`;
}
