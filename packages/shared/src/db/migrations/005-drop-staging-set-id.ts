import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX idx_tcgplayer_staging_set_id`.execute(db);
  await sql`ALTER TABLE tcgplayer_staging DROP COLUMN set_id`.execute(db);

  await sql`DROP INDEX idx_cardmarket_staging_set_id`.execute(db);
  await sql`ALTER TABLE cardmarket_staging DROP COLUMN set_id`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tcgplayer_staging ADD COLUMN set_id text REFERENCES sets(id)`.execute(db);
  await sql`CREATE INDEX idx_tcgplayer_staging_set_id ON tcgplayer_staging(set_id)`.execute(db);

  await sql`ALTER TABLE cardmarket_staging ADD COLUMN set_id text REFERENCES sets(id)`.execute(db);
  await sql`CREATE INDEX idx_cardmarket_staging_set_id ON cardmarket_staging(set_id)`.execute(db);
}
