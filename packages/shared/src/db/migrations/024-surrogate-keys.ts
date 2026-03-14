import type { Kysely } from "kysely";
import { sql } from "kysely";

// ── FK constraints to manage ───────────────────────────────────────────────

const PRINTING_FKS = [
  { table: "copies", constraint: "copies_printing_id_fkey", nullable: false },
  { table: "activity_items", constraint: "activity_items_printing_id_fkey", nullable: false },
  { table: "wish_list_items", constraint: "wish_list_items_printing_id_fkey", nullable: true },
  {
    table: "marketplace_sources",
    constraint: "marketplace_sources_printing_id_fkey",
    nullable: false,
  },
  { table: "printing_images", constraint: "printing_images_printing_id_fkey", nullable: false },
  { table: "printing_sources", constraint: "printing_sources_printing_id_fkey", nullable: true },
] as const;

const CARD_FKS = [
  { table: "printings", constraint: "printings_card_id_fkey", nullable: false },
  { table: "deck_cards", constraint: "deck_cards_card_id_fkey", nullable: false },
  { table: "wish_list_items", constraint: "wish_list_items_card_id_fkey", nullable: true },
  {
    table: "marketplace_staging_card_overrides",
    constraint: "marketplace_staging_card_overrides_card_id_fkey",
    nullable: false,
  },
  { table: "card_name_aliases", constraint: "card_name_aliases_card_id_fkey", nullable: false },
  { table: "card_sources", constraint: "card_sources_card_id_fkey", nullable: true },
] as const;

const SET_FKS = [
  { table: "printings", constraint: "printings_set_id_fkey", nullable: false },
] as const;

// ── Indexes containing affected FK columns ─────────────────────────────────

const AFFECTED_INDEXES = [
  // printings FK columns
  "idx_printings_card_id",
  "idx_printings_set_id",
  // copies
  "idx_copies_user_printing",
  // marketplace_sources
  "idx_marketplace_sources_printing_id",
  // printing_images
  "idx_printing_images_active",
  "idx_printing_images_source",
  "idx_printing_images_printing_id",
  // printing_sources
  "idx_printing_sources_card_source_printing",
  "idx_printing_sources_printing_id",
  // card_sources
  "idx_card_sources_card_id",
] as const;

const AFFECTED_UNIQUE_CONSTRAINTS = [
  { table: "deck_cards", constraint: "uq_deck_cards" },
  { table: "wish_list_items", constraint: "uq_wish_list_items_card" },
  { table: "wish_list_items", constraint: "uq_wish_list_items_printing" },
  {
    table: "marketplace_sources",
    constraint: "marketplace_sources_marketplace_printing_id_key",
  },
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Phase 1: Add slug + new uuid PK to parent tables ──────────────────

  for (const table of ["sets", "cards", "printings"]) {
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN slug text`).execute(db);
    await sql.raw(`UPDATE ${table} SET slug = id`).execute(db);
    await sql.raw(`ALTER TABLE ${table} ALTER COLUMN slug SET NOT NULL`).execute(db);

    await sql.raw(`ALTER TABLE ${table} ADD COLUMN new_id uuid DEFAULT uuidv7()`).execute(db);
    await sql.raw(`UPDATE ${table} SET new_id = uuidv7() WHERE new_id IS NULL`).execute(db);
    await sql.raw(`ALTER TABLE ${table} ALTER COLUMN new_id SET NOT NULL`).execute(db);
  }

  // ── Phase 2: Add new uuid FK columns to child tables ──────────────────

  // printings → cards (card_id) and printings → sets (set_id)
  await sql`ALTER TABLE printings ADD COLUMN new_card_id uuid`.execute(db);
  await sql`
    UPDATE printings p SET new_card_id = c.new_id
    FROM cards c WHERE c.id = p.card_id
  `.execute(db);
  await sql`ALTER TABLE printings ALTER COLUMN new_card_id SET NOT NULL`.execute(db);

  await sql`ALTER TABLE printings ADD COLUMN new_set_id uuid`.execute(db);
  await sql`
    UPDATE printings p SET new_set_id = s.new_id
    FROM sets s WHERE s.id = p.set_id
  `.execute(db);
  await sql`ALTER TABLE printings ALTER COLUMN new_set_id SET NOT NULL`.execute(db);

  // Child tables → printings (printing_id)
  for (const { table, nullable } of PRINTING_FKS) {
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN new_printing_id uuid`).execute(db);
    await sql
      .raw(
        `UPDATE ${table} t SET new_printing_id = p.new_id FROM printings p WHERE p.id = t.printing_id`,
      )
      .execute(db);
    if (!nullable) {
      await sql.raw(`ALTER TABLE ${table} ALTER COLUMN new_printing_id SET NOT NULL`).execute(db);
    }
  }

  // Child tables → cards (card_id), skip printings (handled above as new_card_id)
  for (const { table, nullable } of CARD_FKS) {
    if (table === "printings") {
      continue;
    }
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN new_card_id uuid`).execute(db);
    await sql
      .raw(`UPDATE ${table} t SET new_card_id = c.new_id FROM cards c WHERE c.id = t.card_id`)
      .execute(db);
    if (!nullable) {
      await sql.raw(`ALTER TABLE ${table} ALTER COLUMN new_card_id SET NOT NULL`).execute(db);
    }
  }

  // ── Phase 3: Drop old constraints ─────────────────────────────────────

  for (const { table, constraint } of [...PRINTING_FKS, ...CARD_FKS, ...SET_FKS]) {
    await sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`).execute(db);
  }
  for (const { table, constraint } of AFFECTED_UNIQUE_CONSTRAINTS) {
    await sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`).execute(db);
  }
  for (const idx of AFFECTED_INDEXES) {
    await sql.raw(`DROP INDEX ${idx}`).execute(db);
  }
  for (const table of ["sets", "cards", "printings"]) {
    await sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_pkey`).execute(db);
  }

  // ── Phase 4: Drop old columns, rename new ones ────────────────────────

  for (const table of ["sets", "cards", "printings"]) {
    await sql.raw(`ALTER TABLE ${table} DROP COLUMN id`).execute(db);
    await sql.raw(`ALTER TABLE ${table} RENAME COLUMN new_id TO id`).execute(db);
  }

  await sql`ALTER TABLE printings DROP COLUMN card_id`.execute(db);
  await sql`ALTER TABLE printings RENAME COLUMN new_card_id TO card_id`.execute(db);
  await sql`ALTER TABLE printings DROP COLUMN set_id`.execute(db);
  await sql`ALTER TABLE printings RENAME COLUMN new_set_id TO set_id`.execute(db);

  for (const { table } of PRINTING_FKS) {
    await sql.raw(`ALTER TABLE ${table} DROP COLUMN printing_id`).execute(db);
    await sql.raw(`ALTER TABLE ${table} RENAME COLUMN new_printing_id TO printing_id`).execute(db);
  }

  for (const { table } of CARD_FKS) {
    if (table === "printings") {
      continue;
    }
    await sql.raw(`ALTER TABLE ${table} DROP COLUMN card_id`).execute(db);
    await sql.raw(`ALTER TABLE ${table} RENAME COLUMN new_card_id TO card_id`).execute(db);
  }

  // ── Phase 5: Add new constraints ──────────────────────────────────────

  for (const table of ["sets", "cards", "printings"]) {
    await sql.raw(`ALTER TABLE ${table} ADD PRIMARY KEY (id)`).execute(db);
    await sql
      .raw(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_slug_key UNIQUE (slug)`)
      .execute(db);
  }

  // FK constraints — no CASCADE (uuid PKs are immutable)
  for (const { table, constraint } of PRINTING_FKS) {
    await sql
      .raw(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (printing_id) REFERENCES printings(id)`,
      )
      .execute(db);
  }
  for (const { table, constraint } of CARD_FKS) {
    await sql
      .raw(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (card_id) REFERENCES cards(id)`,
      )
      .execute(db);
  }
  for (const { table, constraint } of SET_FKS) {
    await sql
      .raw(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (set_id) REFERENCES sets(id)`,
      )
      .execute(db);
  }

  // Recreate indexes (unique constraints as indexes — the up() path uses indexes)
  await sql`CREATE INDEX idx_printings_card_id ON printings (card_id)`.execute(db);
  await sql`CREATE INDEX idx_printings_set_id ON printings (set_id)`.execute(db);
  await sql`CREATE INDEX idx_copies_user_printing ON copies (user_id, printing_id)`.execute(db);
  await sql`CREATE UNIQUE INDEX uq_deck_cards ON deck_cards (deck_id, card_id, zone)`.execute(db);
  await sql`CREATE UNIQUE INDEX uq_wish_list_items_card ON wish_list_items (wish_list_id, card_id)`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX uq_wish_list_items_printing ON wish_list_items (wish_list_id, printing_id)`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_sources ADD CONSTRAINT marketplace_sources_marketplace_printing_id_key UNIQUE (marketplace, printing_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_marketplace_sources_printing_id ON marketplace_sources (printing_id)`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX idx_printing_images_active ON printing_images (printing_id, face) WHERE (is_active = true)`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX idx_printing_images_source ON printing_images (printing_id, face, source)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_printing_images_printing_id ON printing_images (printing_id)`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX idx_printing_sources_card_source_printing ON printing_sources (card_source_id, printing_id) WHERE (printing_id IS NOT NULL)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_printing_sources_printing_id ON printing_sources (printing_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_card_sources_card_id ON card_sources (card_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // ── Phase 1: Add text FK columns via parent slug lookups ──────────────

  await sql`ALTER TABLE printings ADD COLUMN old_card_id text`.execute(db);
  await sql`
    UPDATE printings p SET old_card_id = c.slug
    FROM cards c WHERE c.id = p.card_id
  `.execute(db);
  await sql`ALTER TABLE printings ALTER COLUMN old_card_id SET NOT NULL`.execute(db);

  await sql`ALTER TABLE printings ADD COLUMN old_set_id text`.execute(db);
  await sql`
    UPDATE printings p SET old_set_id = s.slug
    FROM sets s WHERE s.id = p.set_id
  `.execute(db);
  await sql`ALTER TABLE printings ALTER COLUMN old_set_id SET NOT NULL`.execute(db);

  for (const { table, nullable } of PRINTING_FKS) {
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN old_printing_id text`).execute(db);
    await sql
      .raw(
        `UPDATE ${table} t SET old_printing_id = p.slug FROM printings p WHERE p.id = t.printing_id`,
      )
      .execute(db);
    if (!nullable) {
      await sql.raw(`ALTER TABLE ${table} ALTER COLUMN old_printing_id SET NOT NULL`).execute(db);
    }
  }

  for (const { table, nullable } of CARD_FKS) {
    if (table === "printings") {
      continue;
    }
    await sql.raw(`ALTER TABLE ${table} ADD COLUMN old_card_id text`).execute(db);
    await sql
      .raw(`UPDATE ${table} t SET old_card_id = c.slug FROM cards c WHERE c.id = t.card_id`)
      .execute(db);
    if (!nullable) {
      await sql.raw(`ALTER TABLE ${table} ALTER COLUMN old_card_id SET NOT NULL`).execute(db);
    }
  }

  // ── Phase 2: Drop all new constraints ─────────────────────────────────

  for (const { table, constraint } of [...PRINTING_FKS, ...CARD_FKS, ...SET_FKS]) {
    await sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`).execute(db);
  }
  // up() creates uq_deck_cards, uq_wish_list_items_card, uq_wish_list_items_printing
  // as unique indexes, and marketplace_sources_marketplace_printing_id_key as a constraint
  for (const { table, constraint } of AFFECTED_UNIQUE_CONSTRAINTS) {
    await (constraint === "marketplace_sources_marketplace_printing_id_key"
      ? sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`).execute(db)
      : sql.raw(`DROP INDEX ${constraint}`).execute(db));
  }
  for (const idx of AFFECTED_INDEXES) {
    await sql.raw(`DROP INDEX ${idx}`).execute(db);
  }
  for (const table of ["sets", "cards", "printings"]) {
    await sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_slug_key`).execute(db);
    await sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_pkey`).execute(db);
  }

  // ── Phase 3: Drop uuid columns, rename text columns back ──────────────

  await sql`ALTER TABLE printings DROP COLUMN card_id`.execute(db);
  await sql`ALTER TABLE printings RENAME COLUMN old_card_id TO card_id`.execute(db);
  await sql`ALTER TABLE printings DROP COLUMN set_id`.execute(db);
  await sql`ALTER TABLE printings RENAME COLUMN old_set_id TO set_id`.execute(db);

  for (const { table } of PRINTING_FKS) {
    await sql.raw(`ALTER TABLE ${table} DROP COLUMN printing_id`).execute(db);
    await sql.raw(`ALTER TABLE ${table} RENAME COLUMN old_printing_id TO printing_id`).execute(db);
  }

  for (const { table } of CARD_FKS) {
    if (table === "printings") {
      continue;
    }
    await sql.raw(`ALTER TABLE ${table} DROP COLUMN card_id`).execute(db);
    await sql.raw(`ALTER TABLE ${table} RENAME COLUMN old_card_id TO card_id`).execute(db);
  }

  for (const table of ["sets", "cards", "printings"]) {
    await sql.raw(`ALTER TABLE ${table} DROP COLUMN id`).execute(db);
    await sql.raw(`ALTER TABLE ${table} RENAME COLUMN slug TO id`).execute(db);
  }

  // ── Phase 4: Re-add constraints ───────────────────────────────────────

  for (const table of ["sets", "cards", "printings"]) {
    await sql.raw(`ALTER TABLE ${table} ADD PRIMARY KEY (id)`).execute(db);
  }

  // Restore ON UPDATE CASCADE for printing and card FKs
  for (const { table, constraint } of PRINTING_FKS) {
    await sql
      .raw(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (printing_id) REFERENCES printings(id) ON UPDATE CASCADE`,
      )
      .execute(db);
  }
  for (const { table, constraint } of CARD_FKS) {
    await sql
      .raw(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (card_id) REFERENCES cards(id) ON UPDATE CASCADE`,
      )
      .execute(db);
  }
  // printings_set_id_fkey was originally NO ACTION (never had CASCADE)
  for (const { table, constraint } of SET_FKS) {
    await sql
      .raw(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (set_id) REFERENCES sets(id)`,
      )
      .execute(db);
  }

  // Recreate indexes and unique constraints (as constraints, not indexes,
  // to match the pre-024 state so up() can DROP CONSTRAINT on re-run)
  await sql`CREATE INDEX idx_printings_card_id ON printings (card_id)`.execute(db);
  await sql`CREATE INDEX idx_printings_set_id ON printings (set_id)`.execute(db);
  await sql`CREATE INDEX idx_copies_user_printing ON copies (user_id, printing_id)`.execute(db);
  await sql`ALTER TABLE deck_cards ADD CONSTRAINT uq_deck_cards UNIQUE (deck_id, card_id, zone)`.execute(
    db,
  );
  await sql`ALTER TABLE wish_list_items ADD CONSTRAINT uq_wish_list_items_card UNIQUE (wish_list_id, card_id)`.execute(
    db,
  );
  await sql`ALTER TABLE wish_list_items ADD CONSTRAINT uq_wish_list_items_printing UNIQUE (wish_list_id, printing_id)`.execute(
    db,
  );
  await sql`ALTER TABLE marketplace_sources ADD CONSTRAINT marketplace_sources_marketplace_printing_id_key UNIQUE (marketplace, printing_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_marketplace_sources_printing_id ON marketplace_sources (printing_id)`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX idx_printing_images_active ON printing_images (printing_id, face) WHERE (is_active = true)`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX idx_printing_images_source ON printing_images (printing_id, face, source)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_printing_images_printing_id ON printing_images (printing_id)`.execute(
    db,
  );
  await sql`CREATE UNIQUE INDEX idx_printing_sources_card_source_printing ON printing_sources (card_source_id, printing_id) WHERE (printing_id IS NOT NULL)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_printing_sources_printing_id ON printing_sources (printing_id)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_card_sources_card_id ON card_sources (card_id)`.execute(db);
}
