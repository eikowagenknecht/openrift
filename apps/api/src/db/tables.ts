import type {
  ActivityAction,
  ArtVariant,
  CardFace,
  CardType,
  DeckFormat,
  DeckZone,
  Finish,
  Rarity,
  UserPreferencesResponse,
} from "@openrift/shared/types";
import type { ColumnType, Generated } from "kysely";

// ─── Column helpers ──────────────────────────────────────────────────────────

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
  printedTotal: number | null;
  sortOrder: number;
  releasedAt: string | null;
  released: Generated<boolean>;
  setType: Generated<"main" | "supplemental">;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
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
  normName: Generated<string>;
  /** FK → card_types(slug) */
  type: CardType;
  /** CHECK: >= 0 */
  might: number | null;
  /** CHECK: >= 0 */
  energy: number | null;
  /** CHECK: >= 0 */
  power: number | null;
  /** CHECK: >= 0 */
  mightBonus: number | null;
  keywords: string[];
  tags: string[];
  /** CHECK: <> '' */
  comment: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** @see cardErrataFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface CardErrataTable {
  id: Generated<string>;
  cardId: string;
  /** CHECK: <> '' */
  correctedRulesText: string | null;
  /** CHECK: <> '' */
  correctedEffectText: string | null;
  /** CHECK: <> '' */
  source: string;
  /** CHECK: <> '' */
  sourceUrl: string | null;
  effectiveDate: Date | null;
  createdAt: CreatedAt;
}

/**
 * Physical printing of a game card.
 *
 * @see printingFieldRules in `schemas.ts` for Zod validation of CHECK constraints
 */
export interface PrintingsTable {
  id: Generated<string>;
  cardId: string;
  setId: string;
  /** CHECK: <> '' */
  shortCode: string;
  /** FK → rarities(slug) */
  rarity: Rarity;
  /** FK → art_variants(slug) */
  artVariant: ArtVariant;
  isSigned: boolean;
  /**
   * Sorted slug array maintained by trigger from `printing_markers`.
   * Empty array `{}` means "no markers" (regular printing).
   */
  markerSlugs: Generated<string[]>;
  /** FK → finishes(slug) */
  finish: Finish;
  /** CHECK: <> '' */
  artist: string;
  /** CHECK: <> '' */
  publicCode: string;
  /** CHECK: <> '' */
  printedRulesText: string | null;
  /** CHECK: <> '' */
  printedEffectText: string | null;
  /** CHECK: <> '' */
  flavorText: string | null;
  /** CHECK: <> '' */
  comment: string | null;
  language: string;
  printedName: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Unified marketplace pricing (migration 022) ────────────────────────────

export type MarketplaceGroupKind = "basic" | "special";

export interface MarketplaceGroupsTable {
  id: Generated<string>;
  marketplace: string;
  groupId: number;
  name: string | null;
  abbreviation: string | null;
  groupKind: Generated<MarketplaceGroupKind>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** Level 2: one row per upstream marketplace listing (e.g. one TCGplayer product). */
/**
 * Level 2: one row per *SKU* in the upstream marketplace —
 * `(marketplace, external_id, finish, language)`. `language` is NULL when
 * the marketplace doesn't expose language as a SKU dimension (Cardmarket's
 * price guide is cross-language; TCGPlayer sells English-only and treats
 * language as implicit). The unique index is NULLS NOT DISTINCT so CM/TCG
 * can't accidentally get two NULL-language rows for the same pair.
 */
export interface MarketplaceProductsTable {
  id: Generated<string>;
  /** CHECK: <> '' ; FK composite → marketplace_groups(marketplace, group_id) */
  marketplace: string;
  /** CHECK: > 0 */
  externalId: number;
  /** FK composite → marketplace_groups(marketplace, group_id) */
  groupId: number;
  /** CHECK: <> '' */
  productName: string;
  finish: string;
  language: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Level 3: bridge table linking a marketplace SKU to a printing. A single SKU
 * can fan out to multiple printings (e.g. Cardmarket's language-aggregate row
 * covers every language of the same card).
 */
export interface MarketplaceProductVariantsTable {
  id: Generated<string>;
  marketplaceProductId: string;
  printingId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Price history per marketplace SKU. One row per
 * `(marketplace_product_id, recorded_at)`; every bound printing for a SKU
 * shares the same price history through
 * `marketplace_products → marketplace_product_variants`.
 * @see marketplaceProductPriceFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface MarketplaceProductPricesTable {
  marketplaceProductId: string;
  recordedAt: Date;
  /** CHECK: >= 0. Null for marketplaces without a true "market" price (e.g. cardtrader, where lowCents is the headline). */
  marketCents: number | null;
  /** CHECK: >= 0 */
  lowCents: number | null;
  /** CHECK: >= 0. Lowest asking price among CardTrader Zero (hub-eligible) sellers. Null for non-cardtrader marketplaces. */
  zeroLowCents: number | null;
  /** CHECK: >= 0 */
  midCents: number | null;
  /** CHECK: >= 0 */
  highCents: number | null;
  /** CHECK: >= 0 */
  trendCents: number | null;
  /** CHECK: >= 0 */
  avg1Cents: number | null;
  /** CHECK: >= 0 */
  avg7Cents: number | null;
  /** CHECK: >= 0 */
  avg30Cents: number | null;
  createdAt: CreatedAt;
}

/** Level 2 ignores: deny an entire upstream product (e.g. sealed product, bundles). */
export interface MarketplaceIgnoredProductsTable {
  marketplace: string;
  externalId: number;
  productName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** Level 3 ignores: deny a specific marketplace SKU (identified by product row) from auto-binding. */
export interface MarketplaceIgnoredVariantsTable {
  marketplaceProductId: string;
  productName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Pin a specific marketplace SKU to a card, overriding name-based matching.
 * Keyed on the product row so the override survives across price refreshes.
 */
export interface MarketplaceProductCardOverridesTable {
  marketplaceProductId: string;
  cardId: string;
  createdAt: CreatedAt;
}

// ─── Admin (migration 012) ────────────────────────────────────────────────

export interface AdminsTable {
  userId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Auth (migration 003) ─────────────────────────────────────────────────

export interface UsersTable {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  image: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface SessionsTable {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface AccountsTable {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  idToken: string | null;
  password: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface VerificationsTable {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Collection tracking (migration 009) ────────────────────────────────────

/** @see collectionFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface CollectionsTable {
  id: Generated<string>;
  userId: string;
  /** CHECK: <> '' */
  name: string;
  description: string | null;
  availableForDeckbuilding: boolean;
  isInbox: boolean;
  sortOrder: number;
  shareToken: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CopiesTable {
  id: Generated<string>;
  userId: string;
  printingId: string;
  collectionId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * CHECK: action/collection presence —
 *   added → to_collection_id NOT NULL,
 *   removed → from_collection_id NOT NULL,
 *   moved → both NOT NULL.
 */
export interface CollectionEventsTable {
  id: Generated<string>;
  userId: string;
  action: ActivityAction;
  printingId: string;
  copyId: string | null;
  fromCollectionId: string | null;
  fromCollectionName: string | null;
  toCollectionId: string | null;
  toCollectionName: string | null;
  createdAt: CreatedAt;
}

/** @see deckFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface DecksTable {
  id: Generated<string>;
  userId: string;
  /** CHECK: <> '' */
  name: string;
  description: string | null;
  /** FK → deck_formats(slug) */
  format: DeckFormat;
  isWanted: boolean;
  isPublic: boolean;
  shareToken: string | null;
  isPinned: Generated<boolean>;
  archivedAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** @see deckCardFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface DeckCardsTable {
  id: Generated<string>;
  deckId: string;
  cardId: string;
  /** FK → deck_zones(slug) */
  zone: DeckZone;
  /** CHECK: > 0 */
  quantity: number;
  /** Optional FK → printings(id); pins this row's art to a specific printing. */
  preferredPrintingId: string | null;
}

export interface WishListsTable {
  id: Generated<string>;
  userId: string;
  name: string;
  rules: unknown;
  shareToken: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * CHECK: exactly one of card_id or printing_id must be set (XOR).
 * @see wishListItemFieldRules in `schemas.ts` for Zod validation of CHECK constraints
 */
export interface WishListItemsTable {
  id: Generated<string>;
  wishListId: string;
  userId: string;
  cardId: string | null;
  printingId: string | null;
  /** CHECK: > 0 */
  quantityDesired: number;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface TradeListsTable {
  id: Generated<string>;
  userId: string;
  name: string;
  rules: unknown;
  shareToken: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface TradeListItemsTable {
  id: Generated<string>;
  tradeListId: string;
  userId: string;
  copyId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Candidate cards (migration 018, renamed in 038) ─────────────────────────

/** @see candidateCardFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface CandidateCardsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  provider: string;
  /** CHECK: <> '' */
  name: string;
  normName: Generated<string>;
  /** CHECK: <> '' */
  type: string | null;
  superTypes: string[];
  domains: string[];
  /** CHECK: >= 0 */
  might: number | null;
  /** CHECK: >= 0 */
  energy: number | null;
  /** CHECK: >= 0 */
  power: number | null;
  /** CHECK: >= 0 */
  mightBonus: number | null;
  /** CHECK: <> '' */
  rulesText: string | null;
  /** CHECK: <> '' */
  effectText: string | null;
  tags: string[];
  /** CHECK: <> '' */
  shortCode: string | null;
  /** CHECK: <> '' */
  externalId: string;
  /** CHECK: <> '{}' AND <> 'null'::jsonb */
  extraData: unknown | null;
  checkedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** @see candidatePrintingFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface CandidatePrintingsTable {
  id: Generated<string>;
  candidateCardId: string;
  printingId: string | null;
  /** CHECK: <> '' */
  shortCode: string;
  /** CHECK: <> '' */
  setId: string | null;
  /** CHECK: <> '' */
  setName: string | null;
  /** CHECK: <> '' */
  rarity: string | null;
  /** CHECK: <> '' */
  artVariant: string | null;
  isSigned: boolean | null;
  markerSlugs: Generated<string[]>;
  /** CHECK: <> '' */
  finish: string | null;
  /** CHECK: <> '' */
  artist: string | null;
  /** CHECK: <> '' */
  publicCode: string | null;
  /** CHECK: <> '' */
  printedRulesText: string | null;
  /** CHECK: <> '' */
  printedEffectText: string | null;
  /** CHECK: <> '' */
  imageUrl: string | null;
  /** CHECK: <> '' */
  flavorText: string | null;
  /** CHECK: <> '' */
  externalId: string;
  /** CHECK: <> '{}' AND <> 'null'::jsonb */
  extraData: unknown | null;

  language: string | null;
  printedName: string | null;

  checkedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Ignored candidates (migration 031, renamed in 038) ──────────────────────

export interface IgnoredCandidateCardsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  provider: string;
  /** CHECK: <> '' */
  externalId: string;
  createdAt: CreatedAt;
}

export interface IgnoredCandidatePrintingsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  provider: string;
  /** CHECK: <> '' */
  externalId: string;
  /** CHECK: <> '' */
  finish: string | null;
  createdAt: CreatedAt;
}

export interface PrintingLinkOverridesTable {
  /** CHECK: <> '' */
  externalId: string;
  finish: string;
  /** FK: printings(id) ON DELETE CASCADE */
  printingId: string;
  createdAt: CreatedAt;
}

/**
 * Deduplicated image storage. Multiple printing_images rows can reference the
 * same image_files row, avoiding duplicate files on disk.
 */
export interface ImageFilesTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  originalUrl: string | null;
  /** CHECK: <> '' */
  rehostedUrl: string | null;
  /** CHECK: IN (0, 90, 180, 270) */
  rotation: Generated<0 | 90 | 180 | 270>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * CHECK: face IN ('front', 'back')
 * @see printingImageFieldRules in `schemas.ts` for Zod validation of CHECK constraints
 */
export interface PrintingImagesTable {
  id: Generated<string>;
  printingId: string;
  face: CardFace;
  /** CHECK: <> '' */
  provider: string;
  /** FK: image_files(id) */
  imageFileId: string;
  isActive: boolean;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CardNameAliasesTable {
  normName: string;
  /** FK: ON DELETE CASCADE */
  cardId: string;
}

// ─── Languages (migration 054) ───────────────────────────────────────────────

export interface LanguagesTable {
  code: string;
  name: string;
  sortOrder: number;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Markers (migration 090) ──────────────────────────────────────────────────

/**
 * Visual markers stamped/printed on a card (e.g. "promo", "top-8", "prerelease").
 * Identity-bearing: two printings with different marker sets are distinct.
 */
export interface MarkersTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  slug: string;
  /** CHECK: <> '' */
  label: string;
  /** CHECK: <> '' */
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PrintingMarkersTable {
  /** PK part 1 — FK ON DELETE CASCADE */
  printingId: string;
  /** PK part 2 — FK ON DELETE RESTRICT */
  markerId: string;
}

// ─── Distribution channels (migration 090, renamed from promo_types/034) ─────

/**
 * Where a printing was distributed: tournament events, retail products,
 * starter decks, etc. Many-to-many with printings via `printing_distribution_channels`.
 * Not identity-bearing — two printings can share visuals but differ in distribution.
 */
export interface DistributionChannelsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  slug: string;
  /** CHECK: <> '' */
  label: string;
  /** CHECK: <> '' */
  description: string | null;
  /** CHECK: kind IN ('event', 'product') */
  kind: Generated<"event" | "product">;
  sortOrder: Generated<number>;
  /** FK → distribution_channels.id (ON DELETE RESTRICT). NULL = root channel. */
  parentId: string | null;
  /** CHECK: <> '' — optional column header when /promos collapses sparse children. */
  childrenLabel: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PrintingDistributionChannelsTable {
  /** PK part 1 — FK ON DELETE CASCADE */
  printingId: string;
  /** PK part 2 — FK ON DELETE RESTRICT */
  channelId: string;
  /** CHECK: <> '' — e.g. "Top 8 reward at Worlds 2025" */
  distributionNote: string | null;
}

// ─── Provider settings (migration 035, renamed in 038) ───────────────────────

export interface ProviderSettingsTable {
  /** PK — matches candidate_cards.provider */
  provider: string;
  sortOrder: number;
  isHidden: boolean;
  isFavorite: boolean;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Keywords (migration 043, renamed in 116) ────────────────────────────────

export interface KeywordsTable {
  /** PK — canonical keyword name */
  name: string;
  /** CHECK: matches ^#[0-9a-fA-F]{6}$ */
  color: string;
  darkText: boolean;
  isWellKnown: boolean;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Keyword translations (migration 071) ───────────────────────────────────

export interface KeywordTranslationsTable {
  /** FK → keywords(name) ON UPDATE CASCADE */
  keywordName: string;
  /** FK → languages(code) ON UPDATE CASCADE */
  language: string;
  /** CHECK: <> '' */
  label: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Feature flags (migration 014) ───────────────────────────────────────────

export interface FeatureFlagsTable {
  key: string;
  enabled: boolean;
  description: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── User feature flag overrides (migration 057) ────────────────────────────

export interface UserFeatureFlagsTable {
  userId: string;
  flagKey: string;
  enabled: boolean;
}

// ─── Site settings (migration 048) ────────────────────────────────────────────

export interface SiteSettingsTable {
  /** CHECK: <> '' */
  key: string;
  value: string;
  /** CHECK: IN ('web', 'api') */
  scope: "web" | "api";
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── User preferences (migration 047, consolidated in 050) ──────────────────

export interface UserPreferencesTable {
  userId: string;
  data: ColumnType<UserPreferencesResponse, string, string>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Formats (migration 054) ────────────────────────────────────────────────

export interface FormatsTable {
  /** CHECK: <> '' */
  id: string;
  /** CHECK: <> '' */
  name: string;
  createdAt: CreatedAt;
}

// ─── Card Bans (migration 054) ──────────────────────────────────────────────

export interface CardBansTable {
  id: Generated<string>;
  cardId: string;
  formatId: string;
  bannedAt: string;
  unbannedAt: string | null;
  /** CHECK: <> '' */
  reason: string | null;
  createdAt: CreatedAt;
}

// ─── Rules (migration 060) ──────────────────────────────────────────────────

export interface RuleVersionsTable {
  version: string;
  sourceType: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  importedAt: ColumnType<Date, Date | undefined, Date>;
}

export interface RulesTable {
  id: Generated<string>;
  version: string;
  /** CHECK: <> '' */
  ruleNumber: string;
  sortOrder: number;
  /** CHECK: 0–3 */
  depth: number;
  /** CHECK: IN ('title', 'subtitle', 'text') */
  ruleType: string;
  content: string;
  /** CHECK: IN ('added', 'modified', 'removed') */
  changeType: string;
  createdAt: CreatedAt;
}

// ─── Reference tables (migration 062) ────────────────────────────────────────

export interface ReferenceTable {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
}

export type CardTypesTable = ReferenceTable;
export interface RaritiesTable extends ReferenceTable {
  color: string | null;
}
export interface DomainsTable extends ReferenceTable {
  color: string | null;
}
export type SuperTypesTable = ReferenceTable;
export type FinishesTable = ReferenceTable;
export type ArtVariantsTable = ReferenceTable;
export type DeckFormatsTable = ReferenceTable;
export type DeckZonesTable = ReferenceTable;

// ─── Printing events (migration 071) ────────────────────────────────────────

export interface PrintingEventsTable {
  id: Generated<string>;
  eventType: "new" | "changed";
  printingId: string;
  /** JSONB array of { field, from, to } for changed events */
  changes: ColumnType<FieldChange[] | null, string | null, string | null>;
  status: "pending" | "sent" | "failed";
  retryCount: number;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

// ─── Job runs (migration 101) ────────────────────────────────────────────────

export type JobTrigger = "cron" | "admin" | "api";
export type JobStatus = "running" | "succeeded" | "failed";

export interface JobRunsTable {
  id: Generated<string>;
  kind: string;
  trigger: JobTrigger;
  status: JobStatus;
  startedAt: ColumnType<Date, Date | undefined, Date>;
  finishedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  durationMs: ColumnType<number | null, number | null | undefined, number | null>;
  errorMessage: ColumnType<string | null, string | null | undefined, string | null>;
  result: ColumnType<unknown, string | null | undefined, string | null>;
}

// ─── Junction tables (migration 059) ─────────────────────────────────────────

export interface CardDomainsTable {
  cardId: string;
  domainSlug: string;
  ordinal: number;
}

export interface CardSuperTypesTable {
  cardId: string;
  superTypeSlug: string;
}

// ─── Materialized views (migration 085) ─────────────────────────────────────

export interface MvLatestPrintingPricesView {
  printingId: string;
  marketplace: string;
  headlineCents: number;
}

export interface MvCardAggregatesView {
  cardId: string;
  domains: string[];
  superTypes: string[];
}

// ─── Views (migration 096) ───────────────────────────────────────────────────

/** Every column of `printings` plus a precomputed `canonical_rank` integer. */
export type PrintingsOrderedView = PrintingsTable & { canonicalRank: number };

// ─── Database ────────────────────────────────────────────────────────────────

export interface Database {
  // Card data (migration 001, restructured in 007)
  sets: SetsTable;
  cards: CardsTable;
  cardErrata: CardErrataTable;
  printings: PrintingsTable;

  // Unified marketplace pricing (migration 022, split into 4 levels in 078)
  marketplaceGroups: MarketplaceGroupsTable;
  marketplaceProducts: MarketplaceProductsTable;
  marketplaceProductVariants: MarketplaceProductVariantsTable;
  marketplaceProductPrices: MarketplaceProductPricesTable;
  marketplaceIgnoredProducts: MarketplaceIgnoredProductsTable;
  marketplaceIgnoredVariants: MarketplaceIgnoredVariantsTable;
  marketplaceProductCardOverrides: MarketplaceProductCardOverridesTable;

  // Admin (migration 012)
  admins: AdminsTable;

  // Auth tables (migration 003)
  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;

  // Collection tracking (migration 009)
  collections: CollectionsTable;
  copies: CopiesTable;
  collectionEvents: CollectionEventsTable;
  decks: DecksTable;
  deckCards: DeckCardsTable;
  wishLists: WishListsTable;
  wishListItems: WishListItemsTable;
  tradeLists: TradeListsTable;
  tradeListItems: TradeListItemsTable;

  // Candidate cards (migration 018, renamed in 038)
  candidateCards: CandidateCardsTable;
  candidatePrintings: CandidatePrintingsTable;
  cardNameAliases: CardNameAliasesTable;

  // Ignored candidates (migration 031, renamed in 038)
  ignoredCandidateCards: IgnoredCandidateCardsTable;
  ignoredCandidatePrintings: IgnoredCandidatePrintingsTable;

  // Printing link overrides (migration 033)
  printingLinkOverrides: PrintingLinkOverridesTable;

  // Image archive (migration 013, deduplicated in 069, renamed in 071)
  imageFiles: ImageFilesTable;
  printingImages: PrintingImagesTable;

  // Languages (migration 054)
  languages: LanguagesTable;

  // Markers + distribution channels (migration 090, renamed from promo_types/034)
  markers: MarkersTable;
  printingMarkers: PrintingMarkersTable;
  distributionChannels: DistributionChannelsTable;
  printingDistributionChannels: PrintingDistributionChannelsTable;

  // Provider settings (migration 035, renamed in 038)
  providerSettings: ProviderSettingsTable;

  // Feature flags (migration 014)
  featureFlags: FeatureFlagsTable;

  // User feature flag overrides (migration 057)
  userFeatureFlags: UserFeatureFlagsTable;

  // Keywords (migration 043, renamed in 116)
  keywords: KeywordsTable;

  // Keyword translations (migration 071)
  keywordTranslations: KeywordTranslationsTable;

  // Site settings (migration 048)
  siteSettings: SiteSettingsTable;

  // User preferences (migration 047)
  userPreferences: UserPreferencesTable;

  // Formats (migration 054)
  formats: FormatsTable;

  // Card bans (migration 054)
  cardBans: CardBansTable;

  // Rules (migration 060)
  ruleVersions: RuleVersionsTable;
  rules: RulesTable;

  // Reference tables (migration 062)
  cardTypes: CardTypesTable;
  rarities: RaritiesTable;
  domains: DomainsTable;
  superTypes: SuperTypesTable;
  finishes: FinishesTable;
  artVariants: ArtVariantsTable;
  deckFormats: DeckFormatsTable;
  deckZones: DeckZonesTable;

  // Junction tables (migration 062)
  cardDomains: CardDomainsTable;
  cardSuperTypes: CardSuperTypesTable;

  // Printing events (migration 071)
  printingEvents: PrintingEventsTable;

  // Job runs (migration 101)
  jobRuns: JobRunsTable;

  // Materialized views (migration 085)
  mvLatestPrintingPrices: MvLatestPrintingPricesView;
  mvCardAggregates: MvCardAggregatesView;

  // Views (migration 096)
  printingsOrdered: PrintingsOrderedView;
}
