import type { Domain } from "@openrift/shared/types";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { slugTaxonomyRepo } from "./slug-taxonomy.js";

export function domainsRepo(db: Kysely<Database>) {
  return slugTaxonomyRepo(db, {
    table: "domains",
    isInUse: (slug) =>
      db
        .selectFrom("cardDomains")
        .select("cardId")
        .where("domainSlug", "=", slug as Domain)
        .limit(1)
        .executeTakeFirst(),
  });
}
