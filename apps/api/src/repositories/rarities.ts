import type { Rarity } from "@openrift/shared/types/enums";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { slugTaxonomyRepo } from "./slug-taxonomy.js";

export function raritiesRepo(db: Kysely<Database>) {
  return slugTaxonomyRepo(db, {
    table: "rarities",
    isInUse: (slug) =>
      db
        .selectFrom("printings")
        .select("id")
        .where("rarity", "=", slug as Rarity)
        .limit(1)
        .executeTakeFirst(),
  });
}
