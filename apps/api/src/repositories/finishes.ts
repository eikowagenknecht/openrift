import type { Finish } from "@openrift/shared/types";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { slugTaxonomyRepo } from "./slug-taxonomy.js";

/** @returns The finish taxonomy repo; finishes are referenced by `printings.finish`. */
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
