import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Rename table card_images → image_files
  await sql`ALTER TABLE card_images RENAME TO image_files`.execute(db);

  // 2. Rename FK column card_image_id → image_file_id in printing_images
  await sql`ALTER TABLE printing_images RENAME COLUMN card_image_id TO image_file_id`.execute(db);

  // 3. Rename constraints on image_files
  await sql`ALTER TABLE image_files RENAME CONSTRAINT card_images_pkey TO image_files_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE image_files RENAME CONSTRAINT chk_card_images_has_url TO chk_image_files_has_url`.execute(
    db,
  );
  await sql`ALTER TABLE image_files RENAME CONSTRAINT chk_card_images_original_url TO chk_image_files_original_url`.execute(
    db,
  );
  await sql`ALTER TABLE image_files RENAME CONSTRAINT chk_card_images_rehosted_url TO chk_image_files_rehosted_url`.execute(
    db,
  );

  // 4. Rename the unique index on original_url
  await sql`ALTER INDEX idx_card_images_original_url RENAME TO idx_image_files_original_url`.execute(
    db,
  );

  // 5. Rename the FK constraint on printing_images
  await sql`ALTER TABLE printing_images RENAME CONSTRAINT fk_printing_images_card_image TO fk_printing_images_image_file`.execute(
    db,
  );

  // 6. Rename the unique index on printing_images that includes the old column name
  // (The unique index on (printing_id, face, provider) doesn't reference the column name, so no rename needed.)

  // 7. Update rehosted_url paths: /card-images/{setSlug}/{uuid} → /card-images/{last2chars}/{uuid}
  // Extract the UUID (last path segment) and compute the new prefix from its last 2 chars
  await sql`
    UPDATE image_files
    SET rehosted_url = '/card-images/' || RIGHT(SPLIT_PART(rehosted_url, '/', 4), 2) || '/' || SPLIT_PART(rehosted_url, '/', 4)
    WHERE rehosted_url IS NOT NULL
      AND rehosted_url LIKE '/card-images/%/%'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // This migration is not fully reversible because the original set slug is lost from the URL.
  // We reverse the structural renames but leave rehosted_url paths as-is.

  await sql`ALTER TABLE image_files RENAME TO card_images`.execute(db);
  await sql`ALTER TABLE printing_images RENAME COLUMN image_file_id TO card_image_id`.execute(db);
  await sql`ALTER TABLE card_images RENAME CONSTRAINT image_files_pkey TO card_images_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE card_images RENAME CONSTRAINT chk_image_files_has_url TO chk_card_images_has_url`.execute(
    db,
  );
  await sql`ALTER TABLE card_images RENAME CONSTRAINT chk_image_files_original_url TO chk_card_images_original_url`.execute(
    db,
  );
  await sql`ALTER TABLE card_images RENAME CONSTRAINT chk_image_files_rehosted_url TO chk_card_images_rehosted_url`.execute(
    db,
  );
  await sql`ALTER INDEX idx_image_files_original_url RENAME TO idx_card_images_original_url`.execute(
    db,
  );
  await sql`ALTER TABLE printing_images RENAME CONSTRAINT fk_printing_images_image_file TO fk_printing_images_card_image`.execute(
    db,
  );
}
