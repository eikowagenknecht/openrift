import type { ArtVariant } from "@openrift/shared/types";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { slugTaxonomyRepo } from "./slug-taxonomy.js";

/** @returns The art-variant taxonomy repo; variants are referenced by `printings.art_variant`. */
export function artVariantsRepo(db: Kysely<Database>) {
  return slugTaxonomyRepo(db, {
    table: "artVariants",
    isInUse: (slug) =>
      db
        .selectFrom("printings")
        .select("id")
        .where("artVariant", "=", slug as ArtVariant)
        .limit(1)
        .executeTakeFirst(),
  });
}
