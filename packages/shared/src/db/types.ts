import type { ColumnType, Generated } from "kysely";

import type { CardFace, CardType, Domain, Rarity, SuperType } from "../types";

// ─── Column helpers ──────────────────────────────────────────────────────────

/**
 * Postgres can't CHECK individual array elements, so array columns like
 * `domains`, `super_types`, `keywords`, and `tags` are unconstrained at the DB
 * level even though the app treats them as known sets (e.g. `Domain`).
 */
type Unchecked<_AppType> = string;

/** Timestamp column that defaults to NOW() on insert. */
type CreatedAt = ColumnType<Date, Date | undefined, Date>;

/** Timestamp column that defaults to NOW() and updates on every write. */
type UpdatedAt = ColumnType<Date, Date | undefined, Date>;

// ─── Card data ───────────────────────────────────────────────────────────────

export interface SetsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  printed_total: number;
  sort_order: number;
  released_at: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/**
 * Game card — unique by game identity (name + rules).
 *
 * The `slug` is the base printing's source ID (e.g. "OGN-027").
 */
export interface CardsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  type: CardType;
  super_types: Unchecked<SuperType>[];
  domains: Unchecked<Domain>[];
  might: number | null;
  energy: number | null;
  power: number | null;
  might_bonus: number | null;
  keywords: Unchecked<string>[];
  rules_text: string | null;
  effect_text: string | null;
  tags: Unchecked<string>[];
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/**
 * Physical printing of a game card.
 *
 * The `slug` is a composite key: "{source_id}:{art_variant}:{signed|}:{promo|}:{finish}".
 */
export interface PrintingsTable {
  id: Generated<string>;
  slug: string;
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
  flavor_text: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Unified marketplace pricing (migration 022) ────────────────────────────

export interface MarketplaceGroupsTable {
  id: Generated<string>;
  marketplace: string;
  group_id: number;
  name: string | null;
  abbreviation: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface MarketplaceSourcesTable {
  id: Generated<string>;
  marketplace: string;
  printing_id: string;
  external_id: number;
  group_id: number;
  product_name: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface MarketplaceSnapshotsTable {
  id: Generated<string>;
  source_id: string;
  recorded_at: CreatedAt;
  market_cents: number;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  trend_cents: number | null;
  avg1_cents: number | null;
  avg7_cents: number | null;
  avg30_cents: number | null;
}

export interface MarketplaceStagingTable {
  id: Generated<string>;
  marketplace: string;
  external_id: number;
  group_id: number;
  product_name: string;
  finish: string;
  recorded_at: Date;
  market_cents: number;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  trend_cents: number | null;
  avg1_cents: number | null;
  avg7_cents: number | null;
  avg30_cents: number | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface MarketplaceIgnoredProductsTable {
  marketplace: string;
  external_id: number;
  finish: string;
  product_name: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface MarketplaceStagingCardOverridesTable {
  marketplace: string;
  external_id: number;
  finish: string;
  card_id: string;
  created_at: CreatedAt;
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

// ─── Collection tracking (migration 009) ────────────────────────────────────

export interface CollectionsTable {
  id: Generated<string>;
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
  id: Generated<string>;
  user_id: string;
  name: string;
  description: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface CopiesTable {
  id: Generated<string>;
  user_id: string;
  printing_id: string;
  collection_id: string;
  source_id: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface ActivitiesTable {
  id: Generated<string>;
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
  id: Generated<string>;
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
  id: Generated<string>;
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
  id: Generated<string>;
  deck_id: string;
  card_id: string;
  zone: string;
  quantity: number;
}

export interface WishListsTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  rules: unknown;
  share_token: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface WishListItemsTable {
  id: Generated<string>;
  wish_list_id: string;
  user_id: string;
  card_id: string | null;
  printing_id: string | null;
  quantity_desired: number;
}

export interface TradeListsTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  rules: unknown;
  share_token: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface TradeListItemsTable {
  id: Generated<string>;
  trade_list_id: string;
  user_id: string;
  copy_id: string;
}

// ─── Card sources (migration 018) ────────────────────────────────────────────

export interface CardSourcesTable {
  id: Generated<string>;
  card_id: string | null;
  source: string;
  name: string;
  type: string;
  super_types: Unchecked<SuperType>[];
  domains: Unchecked<Domain>[];
  might: number | null;
  energy: number | null;
  power: number | null;
  might_bonus: number | null;
  rules_text: string | null;
  effect_text: string;
  tags: Unchecked<string>[];
  source_id: string | null;
  source_entity_id: string | null;
  extra_data: unknown | null;
  checked_at: Date | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface PrintingSourcesTable {
  id: Generated<string>;
  card_source_id: string;
  printing_id: string | null;
  source_id: string;
  set_id: string | null;
  set_name: string | null;
  collector_number: number;
  rarity: string;
  art_variant: string | null;
  is_signed: boolean;
  is_promo: boolean;
  finish: string;
  artist: string | null;
  public_code: string;
  printed_rules_text: string | null;
  printed_effect_text: string;
  image_url: string | null;
  flavor_text: string;
  extra_data: unknown | null;
  checked_at: Date | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface PrintingImagesTable {
  id: Generated<string>;
  printing_id: string;
  face: CardFace;
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

// ─── Feature flags (migration 014) ───────────────────────────────────────────

export interface FeatureFlagsTable {
  key: string;
  enabled: boolean;
  description: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Database ────────────────────────────────────────────────────────────────

export interface Database {
  // Card data (migration 001, restructured in 007)
  sets: SetsTable;
  cards: CardsTable;
  printings: PrintingsTable;

  // Unified marketplace pricing (migration 022)
  marketplace_groups: MarketplaceGroupsTable;
  marketplace_sources: MarketplaceSourcesTable;
  marketplace_snapshots: MarketplaceSnapshotsTable;
  marketplace_staging: MarketplaceStagingTable;
  marketplace_ignored_products: MarketplaceIgnoredProductsTable;
  marketplace_staging_card_overrides: MarketplaceStagingCardOverridesTable;

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

  // Card sources (migration 018)
  card_sources: CardSourcesTable;
  printing_sources: PrintingSourcesTable;
  card_name_aliases: CardNameAliasesTable;

  // Image archive (migration 013)
  printing_images: PrintingImagesTable;

  // Feature flags (migration 014)
  feature_flags: FeatureFlagsTable;
}
