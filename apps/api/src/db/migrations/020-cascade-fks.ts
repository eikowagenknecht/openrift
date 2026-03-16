import type { Kysely } from "kysely";
import { sql } from "kysely";

const PRINTING_FKS = [
  { table: "copies", constraint: "copies_printing_id_fkey" },
  { table: "activity_items", constraint: "activity_items_printing_id_fkey" },
  { table: "wish_list_items", constraint: "wish_list_items_printing_id_fkey" },
  { table: "tcgplayer_sources", constraint: "tcgplayer_sources_printing_id_fkey" },
  { table: "cardmarket_sources", constraint: "cardmarket_sources_printing_id_fkey" },
  { table: "printing_images", constraint: "printing_images_printing_id_fkey" },
  { table: "printing_sources", constraint: "printing_sources_printing_id_fkey" },
] as const;

const CARD_FKS = [
  { table: "printings", constraint: "printings_card_id_fkey" },
  { table: "deck_cards", constraint: "deck_cards_card_id_fkey" },
  { table: "wish_list_items", constraint: "wish_list_items_card_id_fkey" },
  {
    table: "tcgplayer_staging_card_overrides",
    constraint: "tcgplayer_staging_card_overrides_card_id_fkey",
  },
  {
    table: "cardmarket_staging_card_overrides",
    constraint: "cardmarket_staging_card_overrides_card_id_fkey",
  },
  { table: "card_name_aliases", constraint: "card_name_aliases_card_id_fkey" },
  { table: "card_sources", constraint: "card_sources_card_id_fkey" },
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const { table, constraint } of PRINTING_FKS) {
    await sql`
      ALTER TABLE ${sql.ref(table)}
        DROP CONSTRAINT ${sql.ref(constraint)},
        ADD CONSTRAINT ${sql.ref(constraint)}
          FOREIGN KEY (printing_id) REFERENCES printings(id)
          ON UPDATE CASCADE
    `.execute(db);
  }
  for (const { table, constraint } of CARD_FKS) {
    await sql`
      ALTER TABLE ${sql.ref(table)}
        DROP CONSTRAINT ${sql.ref(constraint)},
        ADD CONSTRAINT ${sql.ref(constraint)}
          FOREIGN KEY (card_id) REFERENCES cards(id)
          ON UPDATE CASCADE
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const { table, constraint } of PRINTING_FKS) {
    await sql`
      ALTER TABLE ${sql.ref(table)}
        DROP CONSTRAINT ${sql.ref(constraint)},
        ADD CONSTRAINT ${sql.ref(constraint)}
          FOREIGN KEY (printing_id) REFERENCES printings(id)
    `.execute(db);
  }
  for (const { table, constraint } of CARD_FKS) {
    await sql`
      ALTER TABLE ${sql.ref(table)}
        DROP CONSTRAINT ${sql.ref(constraint)},
        ADD CONSTRAINT ${sql.ref(constraint)}
          FOREIGN KEY (card_id) REFERENCES cards(id)
    `.execute(db);
  }
}
