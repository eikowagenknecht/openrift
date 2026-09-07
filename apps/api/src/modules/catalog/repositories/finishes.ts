import type { Finish } from "@openrift/shared/types/enums";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { slugTaxonomyRepo } from "./slug-taxonomy.js";

export function finishesRepo(db: Kysely<Database>) {
  return slugTaxonomyRepo(db, {
    table: "finishes",
    isInUse: (slug) =>
      db
        .selectFrom("printings")
        .select("id")
        .where("finish", "=", slug as Finish)
        .limit(1)
        .executeTakeFirst(),
  });
}
