import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE tournaments
      ADD COLUMN format text NOT NULL DEFAULT 'rounds',
      ADD COLUMN cut_size integer NOT NULL DEFAULT 8,
      ADD COLUMN cut_rematch_avoidance boolean NOT NULL DEFAULT false,
      ADD COLUMN legend_tiebreak boolean NOT NULL DEFAULT false,
      ADD COLUMN groups_self_paced boolean NOT NULL DEFAULT true,
      ADD CONSTRAINT chk_tournaments_format CHECK (format IN ('rounds', 'group_cut')),
      ADD CONSTRAINT chk_tournaments_cut_size CHECK (cut_size IN (4, 8, 16)),
      ADD CONSTRAINT chk_tournaments_group_cut
        CHECK (format = 'rounds' OR (pairing_style = 'swiss' AND play_mode = '1v1'))
  `.execute(db);

  await sql`
    CREATE TABLE tournament_groups (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      label text NOT NULL,
      paired_group_id uuid REFERENCES tournament_groups(id) ON DELETE CASCADE,
      UNIQUE (tournament_id, label),
      CONSTRAINT chk_tournament_groups_label CHECK (label <> '')
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_tournament_groups_tournament ON tournament_groups (tournament_id)
  `.execute(db);

  await sql`
    ALTER TABLE tournament_participants
      ADD COLUMN group_id uuid REFERENCES tournament_groups(id) ON DELETE SET NULL,
      ADD COLUMN group_slot integer,
      ADD COLUMN legend_card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
      ADD CONSTRAINT chk_tournament_participants_group_slot
        CHECK (group_slot IS NULL OR (group_slot >= 0 AND group_slot <= 3))
  `.execute(db);

  await sql`
    CREATE TABLE tournament_legend_meta_shares (
      tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      legend_card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      share numeric(6, 3) NOT NULL,
      PRIMARY KEY (tournament_id, legend_card_id),
      CONSTRAINT chk_tournament_legend_meta_shares_share CHECK (share >= 0 AND share <= 100)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE tournament_legend_meta_shares`.execute(db);
  await sql`
    ALTER TABLE tournament_participants
      DROP CONSTRAINT chk_tournament_participants_group_slot,
      DROP COLUMN legend_card_id,
      DROP COLUMN group_slot,
      DROP COLUMN group_id
  `.execute(db);
  await sql`DROP TABLE tournament_groups`.execute(db);
  await sql`
    ALTER TABLE tournaments
      DROP CONSTRAINT chk_tournaments_group_cut,
      DROP CONSTRAINT chk_tournaments_cut_size,
      DROP CONSTRAINT chk_tournaments_format,
      DROP COLUMN groups_self_paced,
      DROP COLUMN legend_tiebreak,
      DROP COLUMN cut_rematch_avoidance,
      DROP COLUMN cut_size,
      DROP COLUMN format
  `.execute(db);
}
