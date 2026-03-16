import type { ColumnType, Generated } from "kysely";

import type {
  ActivityAction,
  ActivityType,
  ArtVariant,
  CardFace,
  CardType,
  DeckFormat,
  DeckZone,
  Domain,
  Finish,
  Rarity,
  SuperType,
} from "./enums.js";

// ─── Column helpers ──────────────────────────────────────────────────────────

/** Unwrap a Kysely column-type wrapper to its select (read) type. */
export type Readable<T> = T extends ColumnType<infer S, any, any> ? S : T;

/** Timestamp column that defaults to NOW() on insert. */
type CreatedAt = ColumnType<Date, Date | undefined, Date>;

/** Timestamp column that defaults to NOW() and updates on every write. */
type UpdatedAt = ColumnType<Date, Date | undefined, Date>;

// ─── Card data ───────────────────────────────────────────────────────────────

/** @see setFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface SetsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  slug: string;
  /** CHECK: <> '' */
  name: string;
  /** CHECK: >= 0 */
  printed_total: number | null;
  sort_order: number;
  released_at: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/**
 * Game card — unique by game identity (name + rules).
 *
 * The `slug` is the base printing's source ID (e.g. "OGN-027").
 * @see cardFieldRules in `schemas.ts` for Zod validation of CHECK constraints
 */
export interface CardsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  slug: string;
  /** CHECK: <> '' */
  name: string;
  norm_name: Generated<string>;
  type: CardType;
  /** CHECK: values in ('Basic','Champion','Signature','Token') */
  super_types: SuperType[];
  /** CHECK: array_length > 0; values in ('Fury','Calm','Mind','Body','Chaos','Order','Colorless') */
  domains: Domain[];
  /** CHECK: >= 0 */
  might: number | null;
  /** CHECK: >= 0 */
  energy: number | null;
  /** CHECK: >= 0 */
  power: number | null;
  /** CHECK: >= 0 */
  might_bonus: number | null;
  keywords: string[];
  /** CHECK: <> '' */
  rules_text: string | null;
  /** CHECK: <> '' */
  effect_text: string | null;
  tags: string[];
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/**
 * Physical printing of a game card.
 *
 * The `slug` is a composite key: "{source_id}:{rarity (lowercase)}:{finish}:{promo|}".
 * @see printingFieldRules in `schemas.ts` for Zod validation of CHECK constraints
 */
export interface PrintingsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  slug: string;
  card_id: string;
  set_id: string;
  /** CHECK: <> '' */
  source_id: string;
  /** CHECK: > 0 */
  collector_number: number;
  rarity: Rarity;
  art_variant: ArtVariant;
  is_signed: boolean;
  is_promo: boolean;
  finish: Finish;
  /** CHECK: <> '' */
  artist: string;
  /** CHECK: <> '' */
  public_code: string;
  /** CHECK: <> '' */
  printed_rules_text: string | null;
  /** CHECK: <> '' */
  printed_effect_text: string | null;
  /** CHECK: <> '' */
  flavor_text: string | null;
  /** CHECK: <> '' */
  comment: string | null;
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

/** @see marketplaceSourceFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface MarketplaceSourcesTable {
  id: Generated<string>;
  /** CHECK: <> '' ; FK composite → marketplace_groups(marketplace, group_id) */
  marketplace: string;
  printing_id: string;
  /** CHECK: > 0 */
  external_id: number;
  /** FK composite → marketplace_groups(marketplace, group_id) */
  group_id: number;
  /** CHECK: <> '' */
  product_name: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/** @see marketplaceSnapshotFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface MarketplaceSnapshotsTable {
  id: Generated<string>;
  source_id: string;
  recorded_at: CreatedAt;
  /** CHECK: >= 0 */
  market_cents: number;
  /** CHECK: >= 0 */
  low_cents: number | null;
  /** CHECK: >= 0 */
  mid_cents: number | null;
  /** CHECK: >= 0 */
  high_cents: number | null;
  /** CHECK: >= 0 */
  trend_cents: number | null;
  /** CHECK: >= 0 */
  avg1_cents: number | null;
  /** CHECK: >= 0 */
  avg7_cents: number | null;
  /** CHECK: >= 0 */
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

/** @see collectionFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface CollectionsTable {
  id: Generated<string>;
  user_id: string;
  /** CHECK: <> '' */
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
  type: ActivityType;
  name: string | null;
  date: Date;
  description: string | null;
  is_auto: boolean;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/**
 * CHECK: action/collection presence —
 *   added → to_collection_id NOT NULL,
 *   removed → from_collection_id NOT NULL,
 *   moved → both NOT NULL.
 */
export interface ActivityItemsTable {
  id: Generated<string>;
  activity_id: string;
  user_id: string;
  activity_type: ActivityType;
  copy_id: string | null;
  printing_id: string;
  action: ActivityAction;
  from_collection_id: string | null;
  from_collection_name: string | null;
  to_collection_id: string | null;
  to_collection_name: string | null;
  metadata_snapshot: unknown;
  created_at: CreatedAt;
}

/** @see deckFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface DecksTable {
  id: Generated<string>;
  user_id: string;
  /** CHECK: <> '' */
  name: string;
  description: string | null;
  format: DeckFormat;
  is_wanted: boolean;
  is_public: boolean;
  share_token: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/** @see deckCardFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface DeckCardsTable {
  id: Generated<string>;
  deck_id: string;
  card_id: string;
  zone: DeckZone;
  /** CHECK: > 0 */
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

/**
 * CHECK: exactly one of card_id or printing_id must be set (XOR).
 * @see wishListItemFieldRules in `schemas.ts` for Zod validation of CHECK constraints
 */
export interface WishListItemsTable {
  id: Generated<string>;
  wish_list_id: string;
  user_id: string;
  card_id: string | null;
  printing_id: string | null;
  /** CHECK: > 0 */
  quantity_desired: number;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
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
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Card sources (migration 018) ────────────────────────────────────────────

/** @see cardSourceFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface CardSourcesTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  source: string;
  /** CHECK: <> '' */
  name: string;
  norm_name: Generated<string>;
  /** CHECK: <> '' */
  type: string | null;
  super_types: string[];
  domains: string[];
  /** CHECK: >= 0 */
  might: number | null;
  /** CHECK: >= 0 */
  energy: number | null;
  /** CHECK: >= 0 */
  power: number | null;
  /** CHECK: >= 0 */
  might_bonus: number | null;
  /** CHECK: <> '' */
  rules_text: string | null;
  /** CHECK: <> '' */
  effect_text: string | null;
  tags: string[];
  /** CHECK: <> '' */
  source_id: string | null;
  /** CHECK: <> '' */
  source_entity_id: string | null;
  /** CHECK: <> '{}' AND <> 'null'::jsonb */
  extra_data: unknown | null;
  checked_at: Date | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/** @see printingSourceFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface PrintingSourcesTable {
  id: Generated<string>;
  card_source_id: string;
  printing_id: string | null;
  /** CHECK: <> '' */
  source_id: string;
  /** CHECK: <> '' */
  set_id: string | null;
  /** CHECK: <> '' */
  set_name: string | null;
  /** CHECK: > 0 */
  collector_number: number | null;
  /** CHECK: <> '' */
  rarity: string | null;
  /** CHECK: <> '' */
  art_variant: string | null;
  is_signed: boolean | null;
  is_promo: boolean | null;
  /** CHECK: <> '' */
  finish: string | null;
  /** CHECK: <> '' */
  artist: string | null;
  /** CHECK: <> '' */
  public_code: string | null;
  /** CHECK: <> '' */
  printed_rules_text: string | null;
  /** CHECK: <> '' */
  printed_effect_text: string | null;
  /** CHECK: <> '' */
  image_url: string | null;
  /** CHECK: <> '' */
  flavor_text: string | null;
  /** CHECK: <> '' */
  source_entity_id: string | null;
  /** CHECK: <> '{}' AND <> 'null'::jsonb */
  extra_data: unknown | null;
  checked_at: Date | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

/**
 * CHECK: face IN ('front', 'back'); at least one URL must be non-NULL
 * @see printingImageFieldRules in `schemas.ts` for Zod validation of CHECK constraints
 */
export interface PrintingImagesTable {
  id: Generated<string>;
  printing_id: string;
  face: CardFace;
  /** CHECK: <> '' */
  source: string;
  /** CHECK: <> '' */
  original_url: string | null;
  /** CHECK: <> '' */
  rehosted_url: string | null;
  is_active: boolean;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface CardNameAliasesTable {
  norm_name: string;
  /** FK: ON DELETE CASCADE */
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
