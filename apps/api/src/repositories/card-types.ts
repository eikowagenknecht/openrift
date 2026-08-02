import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { slugTaxonomyRepo } from "./slug-taxonomy.js";

/** @returns The card-type taxonomy repo. */
export function cardTypesRepo(db: Kysely<Database>) {
  return slugTaxonomyRepo(db, {
    table: "cardTypes",
    // Membership lives in the card_card_types junction (ADR-037), so a slug
    // used only as a secondary type still counts as in use.
    isInUse: (slug) =>
      db
        .selectFrom("cardCardTypes")
        .select("cardId")
        .where("typeSlug", "=", slug)
        .limit(1)
        .executeTakeFirst(),
  });
}
