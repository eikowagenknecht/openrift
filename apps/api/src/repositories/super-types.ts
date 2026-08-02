import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { slugTaxonomyRepo } from "./slug-taxonomy.js";

/** @returns The supertype taxonomy repo; supertypes are referenced by the `card_super_types` junction. */
export function superTypesRepo(db: Kysely<Database>) {
  return slugTaxonomyRepo(db, {
    table: "superTypes",
    isInUse: (slug) =>
      db
        .selectFrom("cardSuperTypes")
        .select("cardId")
        .where("superTypeSlug", "=", slug)
        .limit(1)
        .executeTakeFirst(),
  });
}
