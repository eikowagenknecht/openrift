import { WellKnown } from "@openrift/shared";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Reference table name for each WellKnown category.
 * Used to look up slugs and produce clear error messages.
 */
const TABLE_MAP: Record<string, keyof Database> = {
  cardType: "cardTypes",
  domain: "domains",
  superType: "superTypes",
  finish: "finishes",
  artVariant: "artVariants",
  deckFormat: "deckFormats",
  deckZone: "deckZones",
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
    const table = TABLE_MAP[category];
    if (!table) {
      continue;
    }

    const expectedSlugs = Object.values(slugs) as string[];

    const rows = (await db
      .selectFrom(table as any)
      .select(["slug" as any, "isWellKnown" as any])
      .where("slug" as any, "in", expectedSlugs)
      .execute()) as { slug: string; isWellKnown: boolean }[];

    const found = new Map(rows.map((row) => [row.slug, row.isWellKnown]));

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
