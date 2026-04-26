import { WellKnown } from "@openrift/shared";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Reference table info for each WellKnown category.
 * `pk` is the primary-key column; most reference tables use `slug`, but `keywords` uses `name`.
 */
const TABLE_MAP: Record<string, { table: keyof Database; pk: string }> = {
  cardType: { table: "cardTypes", pk: "slug" },
  domain: { table: "domains", pk: "slug" },
  superType: { table: "superTypes", pk: "slug" },
  finish: { table: "finishes", pk: "slug" },
  artVariant: { table: "artVariants", pk: "slug" },
  deckFormat: { table: "deckFormats", pk: "slug" },
  deckZone: { table: "deckZones", pk: "slug" },
  keyword: { table: "keywords", pk: "name" },
};

/**
 * Verifies that every slug in `WellKnown` exists in its reference table
 * and has `is_well_known = true`. Throws if any are missing.
 *
 * Call this at startup after migrations have run, before accepting traffic.
 */
export async function validateWellKnownSlugs(db: Kysely<Database>): Promise<void> {
  const errors: string[] = [];

  for (const [category, slugs] of Object.entries(WellKnown)) {
    const entry = TABLE_MAP[category];
    if (!entry) {
      continue;
    }

    const { table, pk } = entry;
    const expectedSlugs = Object.values(slugs) as string[];

    const rows = (await db
      .selectFrom(table as any)
      .select([pk as any, "isWellKnown" as any])
      .where(pk as any, "in", expectedSlugs)
      .execute()) as { isWellKnown: boolean; [key: string]: unknown }[];

    const found = new Map(rows.map((row) => [row[pk] as string, row.isWellKnown]));

    for (const [name, slug] of Object.entries(slugs)) {
      if (!found.has(slug)) {
        errors.push(`WellKnown.${category}.${name} = "${slug}" not found in ${table}`);
      } else if (!found.get(slug)) {
        errors.push(
          `WellKnown.${category}.${name} = "${slug}" exists in ${table} but is_well_known is false`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Well-known validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
}
