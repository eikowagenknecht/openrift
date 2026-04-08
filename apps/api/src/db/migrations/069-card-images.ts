import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Create the card_images table
  await sql`
    CREATE TABLE card_images (
      id UUID DEFAULT uuidv7() NOT NULL PRIMARY KEY,
      original_url TEXT CONSTRAINT chk_card_images_original_url CHECK (original_url <> ''),
      rehosted_url TEXT CONSTRAINT chk_card_images_rehosted_url CHECK (rehosted_url <> ''),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_card_images_has_url CHECK (original_url IS NOT NULL OR rehosted_url IS NOT NULL)
    )
  `.execute(db);

  // Unique index on original_url for deduplication lookups
  await sql`
    CREATE UNIQUE INDEX idx_card_images_original_url
      ON card_images (original_url) WHERE original_url IS NOT NULL
  `.execute(db);

  // Auto-update updated_at trigger (same pattern as other tables)
  await sql`
    CREATE TRIGGER trg_card_images_updated_at
      BEFORE UPDATE ON card_images
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()
  `.execute(db);

  // 2. Populate card_images from printing_images, deduplicating by original_url
  await sql`
    INSERT INTO card_images (id, original_url, rehosted_url, created_at, updated_at)
    SELECT DISTINCT ON (original_url)
      id, original_url, rehosted_url, created_at, updated_at
    FROM printing_images
    WHERE original_url IS NOT NULL
    ORDER BY original_url, rehosted_url DESC NULLS LAST, created_at ASC
  `.execute(db);

  // Also insert orphan rows that only have rehosted_url (no original_url)
  await sql`
    INSERT INTO card_images (id, original_url, rehosted_url, created_at, updated_at)
    SELECT id, NULL, rehosted_url, created_at, updated_at
    FROM printing_images
    WHERE original_url IS NULL AND rehosted_url IS NOT NULL
  `.execute(db);

  // 3. Add card_image_id column to printing_images
  await sql`
    ALTER TABLE printing_images ADD COLUMN card_image_id UUID
  `.execute(db);

  // 4. Backfill card_image_id by matching on original_url
  await sql`
    UPDATE printing_images pi
    SET card_image_id = ci.id
    FROM card_images ci
    WHERE pi.original_url IS NOT NULL AND ci.original_url = pi.original_url
  `.execute(db);

  // Handle orphan rows (only rehosted_url, no original_url)
  await sql`
    UPDATE printing_images pi
    SET card_image_id = ci.id
    FROM card_images ci
    WHERE pi.original_url IS NULL AND pi.rehosted_url IS NOT NULL
      AND ci.id = pi.id
  `.execute(db);

  // 5. Make card_image_id NOT NULL and add FK
  await sql`
    ALTER TABLE printing_images
      ALTER COLUMN card_image_id SET NOT NULL,
      ADD CONSTRAINT fk_printing_images_card_image
        FOREIGN KEY (card_image_id) REFERENCES card_images (id)
  `.execute(db);

  // 6. Drop old columns and constraint
  await sql`
    ALTER TABLE printing_images
      DROP CONSTRAINT chk_printing_images_has_url,
      DROP COLUMN original_url,
      DROP COLUMN rehosted_url
  `.execute(db);

  // 7. Drop the old unique constraint that included provider (no longer needed for dedup)
  // and the unique index on active images stays as-is
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Restore original_url and rehosted_url columns
  await sql`
    ALTER TABLE printing_images
      ADD COLUMN original_url TEXT CONSTRAINT chk_printing_images_original_url CHECK (original_url <> ''),
      ADD COLUMN rehosted_url TEXT CONSTRAINT chk_printing_images_rehosted_url CHECK (rehosted_url <> '')
  `.execute(db);

  // Backfill from card_images
  await sql`
    UPDATE printing_images pi
    SET original_url = ci.original_url,
        rehosted_url = ci.rehosted_url
    FROM card_images ci
    WHERE ci.id = pi.card_image_id
  `.execute(db);

  // Re-add the has_url CHECK constraint
  await sql`
    ALTER TABLE printing_images
      ADD CONSTRAINT chk_printing_images_has_url
        CHECK (original_url IS NOT NULL OR rehosted_url IS NOT NULL)
  `.execute(db);

  // Drop card_image_id column (drops FK automatically)
  await sql`
    ALTER TABLE printing_images DROP COLUMN card_image_id
  `.execute(db);

  // Drop card_images table
  await sql`DROP TABLE card_images`.execute(db);
}
