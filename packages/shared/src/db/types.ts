import type { ColumnType, Generated } from "kysely";

import type { CardType, Rarity } from "../types";

// ─── Column helpers ──────────────────────────────────────────────────────────

/** Timestamp column that defaults to NOW() on insert. */
type CreatedAt = ColumnType<Date, Date | undefined, Date>;

/** Timestamp column that defaults to NOW() and updates on every write. */
type UpdatedAt = ColumnType<Date, Date | undefined, Date>;

// ─── Card data ───────────────────────────────────────────────────────────────

export interface SetsTable {
  id: string;
  name: string;
  printed_total: number;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/**
 * Game card — unique by game identity (name + rules).
 *
 * The `id` is the base printing's source ID (e.g. "OGN-027").
 */
export interface CardsTable {
  id: string;
  name: string;
  type: CardType;
  super_types: string[];
  domains: string[];
  might: number | null;
  energy: number | null;
  power: number | null;
  might_bonus: number | null;
  keywords: string[];
  rules_text: string;
  effect_text: string;
  tags: string[];
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/**
 * Physical printing of a game card.
 *
 * The `id` is a composite key: "{source_id}:{art_variant}:{signed|}:{promo|}:{finish}".
 */
export interface PrintingsTable {
  id: string;
  card_id: string;
  set_id: string;
  source_id: string;
  collector_number: number;
  rarity: Rarity;
  art_variant: string;
  is_signed: boolean;
  is_promo: boolean;
  finish: string;
  image_url: string;
  artist: string;
  public_code: string;
  printed_rules_text: string;
  printed_effect_text: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── TCGPlayer pricing ───────────────────────────────────────────────────────

export interface TcgplayerSourcesTable {
  id: Generated<number>;
  printing_id: string;
  external_id: number;
  group_id: number;
  product_name: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface TcgplayerSnapshotsTable {
  id: Generated<number>;
  source_id: number;
  recorded_at: CreatedAt;
  market_cents: number;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface TcgplayerStagingTable {
  id: Generated<number>;
  external_id: number;
  group_id: number;
  product_name: string;
  finish: string;
  recorded_at: Date;
  market_cents: number;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Cardmarket pricing ─────────────────────────────────────────────────────

export interface CardmarketSourcesTable {
  id: Generated<number>;
  printing_id: string;
  external_id: number;
  group_id: number;
  product_name: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface CardmarketSnapshotsTable {
  id: Generated<number>;
  source_id: number;
  recorded_at: CreatedAt;
  market_cents: number;
  low_cents: number | null;
  trend_cents: number | null;
  avg1_cents: number | null;
  avg7_cents: number | null;
  avg30_cents: number | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface CardmarketStagingTable {
  id: Generated<number>;
  external_id: number;
  group_id: number;
  product_name: string;
  finish: string;
  recorded_at: Date;
  market_cents: number;
  low_cents: number | null;
  trend_cents: number | null;
  avg1_cents: number | null;
  avg7_cents: number | null;
  avg30_cents: number | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── TCGPlayer groups (migration 016) ─────────────────────────────────────

export interface TcgplayerGroupsTable {
  id: Generated<number>;
  group_id: number;
  name: string;
  abbreviation: string;
  set_id: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Cardmarket expansions (migration 017) ────────────────────────────────

export interface CardmarketExpansionsTable {
  id: Generated<number>;
  expansion_id: number;
  set_id: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Admin (migration 012) ────────────────────────────────────────────────

export interface AdminsTable {
  user_id: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Auth (migration 003) ─────────────────────────────────────────────────

export interface UsersTable {
  id: string;
  email: string;
  name: string | null;
  email_verified: boolean;
  image: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  ip_address: string | null;
  user_agent: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface AccountsTable {
  id: string;
  user_id: string;
  account_id: string;
  provider_id: string;
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: Date | null;
  refresh_token_expires_at: Date | null;
  scope: string | null;
  id_token: string | null;
  password: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface VerificationsTable {
  id: string;
  identifier: string;
  value: string;
  expires_at: Date;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Database ────────────────────────────────────────────────────────────────

export interface Database {
  // Card data (migration 001, restructured in 007)
  sets: SetsTable;
  cards: CardsTable;
  printings: PrintingsTable;
  tcgplayer_sources: TcgplayerSourcesTable;
  tcgplayer_snapshots: TcgplayerSnapshotsTable;
  tcgplayer_staging: TcgplayerStagingTable;
  cardmarket_sources: CardmarketSourcesTable;
  cardmarket_snapshots: CardmarketSnapshotsTable;
  cardmarket_staging: CardmarketStagingTable;
  tcgplayer_groups: TcgplayerGroupsTable;
  cardmarket_expansions: CardmarketExpansionsTable;

  // Admin (migration 012)
  admins: AdminsTable;

  // Auth tables (migration 003)
  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;
}
