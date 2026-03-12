import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add name column to cardmarket_expansions (like tcgplayer_groups already has)
  await db.schema.alterTable("cardmarket_expansions").addColumn("name", "text").execute();

  // Drop set_id from both group/expansion tables
  await db.schema.alterTable("cardmarket_expansions").dropColumn("set_id").execute();
  await db.schema.alterTable("tcgplayer_groups").dropColumn("set_id").execute();

  // Drop set_id from staging card override tables (card_id alone is sufficient)
  await db.schema.alterTable("tcgplayer_staging_card_overrides").dropColumn("set_id").execute();
  await db.schema.alterTable("cardmarket_staging_card_overrides").dropColumn("set_id").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Restore set_id on staging card override tables (nullable — original data is lost)
  await sql`ALTER TABLE cardmarket_staging_card_overrides ADD COLUMN set_id text REFERENCES sets(id)`.execute(
    db,
  );
  await sql`ALTER TABLE tcgplayer_staging_card_overrides ADD COLUMN set_id text REFERENCES sets(id)`.execute(
    db,
  );

  // Restore set_id on group/expansion tables
  await sql`ALTER TABLE tcgplayer_groups ADD COLUMN set_id text REFERENCES sets(id)`.execute(db);
  await sql`ALTER TABLE cardmarket_expansions ADD COLUMN set_id text REFERENCES sets(id)`.execute(
    db,
  );

  // Drop name from cardmarket_expansions
  await db.schema.alterTable("cardmarket_expansions").dropColumn("name").execute();
}
