import type { Kysely } from "kysely";

import type { Database } from "../../../db/index.js";
import { slugTaxonomyRepo } from "../../catalog/repositories/slug-taxonomy.js";

export function deckFormatsRepo(db: Kysely<Database>) {
  return slugTaxonomyRepo(db, {
    table: "deckFormats",
    isInUse: (slug) =>
      db.selectFrom("decks").select("id").where("format", "=", slug).limit(1).executeTakeFirst(),
  });
}
