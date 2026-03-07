import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Staging tables: add updated_at (rows are upserted on re-import)
  await sql`ALTER TABLE tcgplayer_staging ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()`.execute(
    db,
  );
  await sql`ALTER TABLE cardmarket_staging ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()`.execute(
    db,
  );

  // Admins: add updated_at for consistency
  await sql`ALTER TABLE admins ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()`.execute(
    db,
  );

  // Snapshot tables: add created_at + updated_at for debugging/consistency
  await sql`ALTER TABLE tcgplayer_snapshots ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()`.execute(
    db,
  );
  await sql`ALTER TABLE tcgplayer_snapshots ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()`.execute(
    db,
  );
  await sql`ALTER TABLE cardmarket_snapshots ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()`.execute(
    db,
  );
  await sql`ALTER TABLE cardmarket_snapshots ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE cardmarket_snapshots DROP COLUMN updated_at`.execute(db);
  await sql`ALTER TABLE cardmarket_snapshots DROP COLUMN created_at`.execute(db);
  await sql`ALTER TABLE tcgplayer_snapshots DROP COLUMN updated_at`.execute(db);
  await sql`ALTER TABLE tcgplayer_snapshots DROP COLUMN created_at`.execute(db);
  await sql`ALTER TABLE admins DROP COLUMN updated_at`.execute(db);
  await sql`ALTER TABLE cardmarket_staging DROP COLUMN updated_at`.execute(db);
  await sql`ALTER TABLE tcgplayer_staging DROP COLUMN updated_at`.execute(db);
}
