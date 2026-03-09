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

// ─── Ignored products ───────────────────────────────────────────────────────

export interface StagingCardOverridesTable {
  external_id: number;
  finish: string;
  card_id: string;
  set_id: string;
  created_at: CreatedAt;
}

export interface TcgplayerIgnoredProductsTable {
  external_id: number;
  finish: string;
  product_name: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface CardmarketIgnoredProductsTable {
  external_id: number;
  finish: string;
  product_name: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Collection tracking (migration 009) ────────────────────────────────────

export interface CollectionsTable {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  available_for_deckbuilding: boolean;
  is_inbox: boolean;
  sort_order: number;
  share_token: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface SourcesTable {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface CopiesTable {
  id: string;
  user_id: string;
  printing_id: string;
  collection_id: string;
  source_id: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface ActivitiesTable {
  id: string;
  user_id: string;
  type: string;
  name: string | null;
  date: Date;
  description: string | null;
  is_auto: boolean;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface ActivityItemsTable {
  id: string;
  activity_id: string;
  user_id: string;
  activity_type: string;
  copy_id: string | null;
  printing_id: string;
  action: string;
  from_collection_id: string | null;
  from_collection_name: string | null;
  to_collection_id: string | null;
  to_collection_name: string | null;
  metadata_snapshot: unknown;
  created_at: CreatedAt;
}

export interface DecksTable {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  format: string;
  is_wanted: boolean;
  is_public: boolean;
  share_token: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface DeckCardsTable {
  id: string;
  deck_id: string;
  card_id: string;
  zone: string;
  quantity: number;
}

export interface WishListsTable {
  id: string;
  user_id: string;
  name: string;
  rules: unknown;
  share_token: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface WishListItemsTable {
  id: string;
  wish_list_id: string;
  user_id: string;
  card_id: string | null;
  printing_id: string | null;
  quantity_desired: number;
}

export interface TradeListsTable {
  id: string;
  user_id: string;
  name: string;
  rules: unknown;
  share_token: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface TradeListItemsTable {
  id: string;
  trade_list_id: string;
  user_id: string;
  copy_id: string;
}

// ─── Candidate import (migration 012) ────────────────────────────────────────

export interface CandidateCardsTable {
  id: Generated<string>;
  status: string;
  source: string;
  match_card_id: string | null;
  source_id: string;
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
  reviewed_at: Date | null;
  reviewed_by: string | null;
}

export interface CandidatePrintingsTable {
  id: Generated<string>;
  candidate_card_id: string;
  source_id: string;
  set_id: string;
  set_name: string | null;
  collector_number: number;
  rarity: Rarity;
  art_variant: string;
  is_signed: boolean;
  is_promo: boolean;
  finish: string;
  artist: string;
  public_code: string;
  printed_rules_text: string;
  printed_effect_text: string;
  image_url: string | null;
  created_at: CreatedAt;
}

export interface PrintingImagesTable {
  id: Generated<string>;
  printing_id: string;
  face: string;
  source: string;
  original_url: string | null;
  rehosted_url: string | null;
  is_active: boolean;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface CardNameAliasesTable {
  alias: string;
  card_id: string;
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
  tcgplayer_staging_card_overrides: StagingCardOverridesTable;
  cardmarket_staging_card_overrides: StagingCardOverridesTable;
  tcgplayer_ignored_products: TcgplayerIgnoredProductsTable;
  cardmarket_ignored_products: CardmarketIgnoredProductsTable;

  // Admin (migration 012)
  admins: AdminsTable;

  // Auth tables (migration 003)
  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;

  // Collection tracking (migration 009)
  collections: CollectionsTable;
  sources: SourcesTable;
  copies: CopiesTable;
  activities: ActivitiesTable;
  activity_items: ActivityItemsTable;
  decks: DecksTable;
  deck_cards: DeckCardsTable;
  wish_lists: WishListsTable;
  wish_list_items: WishListItemsTable;
  trade_lists: TradeListsTable;
  trade_list_items: TradeListItemsTable;

  // Candidate import (migration 012)
  candidate_cards: CandidateCardsTable;
  candidate_printings: CandidatePrintingsTable;
  card_name_aliases: CardNameAliasesTable;

  // Image archive (migration 013)
  printing_images: PrintingImagesTable;
}
