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
  type: CardType;
  /** CHECK: values in ('Basic','Champion','Signature','Token') */
  superTypes: SuperType[];
  /** CHECK: array_length > 0; values in ('Fury','Calm','Mind','Body','Chaos','Order','Colorless') */
  domains: Domain[];
  /** CHECK: >= 0 */
  might: number | null;
  /** CHECK: >= 0 */
  energy: number | null;
  /** CHECK: >= 0 */
  power: number | null;
  /** CHECK: >= 0 */
  mightBonus: number | null;
  keywords: string[];
  /** CHECK: <> '' */
  rulesText: string | null;
  /** CHECK: <> '' */
  effectText: string | null;
  tags: string[];
  /** CHECK: <> '' */
  comment: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Physical printing of a game card.
 *
 * The `slug` is a composite key: "{short_code}:{rarity (lowercase)}:{finish}:{promo_type_slug|}".
 * @see printingFieldRules in `schemas.ts` for Zod validation of CHECK constraints
 */
export interface PrintingsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  slug: string;
  cardId: string;
  setId: string;
  /** CHECK: <> '' */
  shortCode: string;
  /** CHECK: > 0 */
  collectorNumber: number;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  promoTypeId: string | null;
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
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Unified marketplace pricing (migration 022) ────────────────────────────

export interface MarketplaceGroupsTable {
  id: Generated<string>;
  marketplace: string;
  groupId: number;
  name: string | null;
  abbreviation: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** @see marketplaceProductFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface MarketplaceProductsTable {
  id: Generated<string>;
  /** CHECK: <> '' ; FK composite → marketplace_groups(marketplace, group_id) */
  marketplace: string;
  printingId: string;
  /** CHECK: > 0 */
  externalId: number;
  /** FK composite → marketplace_groups(marketplace, group_id) */
  groupId: number;
  /** CHECK: <> '' */
  productName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** @see marketplaceSnapshotFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface MarketplaceSnapshotsTable {
  id: Generated<string>;
  productId: string;
  recordedAt: CreatedAt;
  /** CHECK: >= 0 */
  marketCents: number;
  /** CHECK: >= 0 */
  lowCents: number | null;
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
}

export interface MarketplaceStagingTable {
  id: Generated<string>;
  marketplace: string;
  externalId: number;
  groupId: number;
  productName: string;
  finish: string;
  recordedAt: Date;
  marketCents: number;
  lowCents: number | null;
  midCents: number | null;
  highCents: number | null;
  trendCents: number | null;
  avg1Cents: number | null;
  avg7Cents: number | null;
  avg30Cents: number | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MarketplaceIgnoredProductsTable {
  marketplace: string;
  externalId: number;
  finish: string;
  productName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MarketplaceStagingCardOverridesTable {
  marketplace: string;
  externalId: number;
  finish: string;
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

export interface AcquisitionSourcesTable {
  id: Generated<string>;
  userId: string;
  name: string;
  description: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CopiesTable {
  id: Generated<string>;
  userId: string;
  printingId: string;
  collectionId: string;
  acquisitionSourceId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface ActivitiesTable {
  id: Generated<string>;
  userId: string;
  type: ActivityType;
  name: string | null;
  date: Date;
  description: string | null;
  isAuto: boolean;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * CHECK: action/collection presence —
 *   added → to_collection_id NOT NULL,
 *   removed → from_collection_id NOT NULL,
 *   moved → both NOT NULL.
 */
export interface ActivityItemsTable {
  id: Generated<string>;
  activityId: string;
  userId: string;
  activityType: ActivityType;
  copyId: string | null;
  printingId: string;
  action: ActivityAction;
  fromCollectionId: string | null;
  fromCollectionName: string | null;
  toCollectionId: string | null;
  toCollectionName: string | null;
  metadataSnapshot: unknown;
  createdAt: CreatedAt;
}

/** @see deckFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface DecksTable {
  id: Generated<string>;
  userId: string;
  /** CHECK: <> '' */
  name: string;
  description: string | null;
  format: DeckFormat;
  isWanted: boolean;
  isPublic: boolean;
  shareToken: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** @see deckCardFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface DeckCardsTable {
  id: Generated<string>;
  deckId: string;
  cardId: string;
  zone: DeckZone;
  /** CHECK: > 0 */
  quantity: number;
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
  checkedAt: Date | null;
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
  /** CHECK: > 0 */
  collectorNumber: number | null;
  /** CHECK: <> '' */
  rarity: string | null;
  /** CHECK: <> '' */
  artVariant: string | null;
  isSigned: boolean | null;
  promoTypeId: string | null;
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

  checkedAt: Date | null;
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
  /** CHECK: <> '' */
  printingSlug: string;
  createdAt: CreatedAt;
}

/**
 * CHECK: face IN ('front', 'back'); at least one URL must be non-NULL
 * @see printingImageFieldRules in `schemas.ts` for Zod validation of CHECK constraints
 */
export interface PrintingImagesTable {
  id: Generated<string>;
  printingId: string;
  face: CardFace;
  /** CHECK: <> '' */
  provider: string;
  /** CHECK: <> '' */
  originalUrl: string | null;
  /** CHECK: <> '' */
  rehostedUrl: string | null;
  isActive: boolean;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CardNameAliasesTable {
  normName: string;
  /** FK: ON DELETE CASCADE */
  cardId: string;
}

// ─── Promo types (migration 034) ──────────────────────────────────────────────

export interface PromoTypesTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  slug: string;
  /** CHECK: <> '' */
  label: string;
  sortOrder: number;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Provider settings (migration 035, renamed in 038) ───────────────────────

export interface ProviderSettingsTable {
  /** PK — matches candidate_cards.provider */
  provider: string;
  sortOrder: number;
  isHidden: boolean;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Keyword styles (migration 043) ──────────────────────────────────────────

export interface KeywordStylesTable {
  /** PK — canonical keyword name */
  name: string;
  /** CHECK: matches ^#[0-9a-fA-F]{6}$ */
  color: string;
  darkText: boolean;
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

// ─── User preferences (migration 047) ────────────────────────────────────────

export interface UserPreferencesTable {
  userId: string;
  showImages: Generated<boolean>;
  richEffects: Generated<boolean>;
  cardFieldNumber: Generated<boolean>;
  cardFieldTitle: Generated<boolean>;
  cardFieldType: Generated<boolean>;
  cardFieldRarity: Generated<boolean>;
  cardFieldPrice: Generated<boolean>;
  theme: Generated<string>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Database ────────────────────────────────────────────────────────────────

export interface Database {
  // Card data (migration 001, restructured in 007)
  sets: SetsTable;
  cards: CardsTable;
  printings: PrintingsTable;

  // Unified marketplace pricing (migration 022)
  marketplaceGroups: MarketplaceGroupsTable;
  marketplaceProducts: MarketplaceProductsTable;
  marketplaceSnapshots: MarketplaceSnapshotsTable;
  marketplaceStaging: MarketplaceStagingTable;
  marketplaceIgnoredProducts: MarketplaceIgnoredProductsTable;
  marketplaceStagingCardOverrides: MarketplaceStagingCardOverridesTable;

  // Admin (migration 012)
  admins: AdminsTable;

  // Auth tables (migration 003)
  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;

  // Collection tracking (migration 009)
  collections: CollectionsTable;
  acquisitionSources: AcquisitionSourcesTable;
  copies: CopiesTable;
  activities: ActivitiesTable;
  activityItems: ActivityItemsTable;
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

  // Image archive (migration 013)
  printingImages: PrintingImagesTable;

  // Promo types (migration 034)
  promoTypes: PromoTypesTable;

  // Provider settings (migration 035, renamed in 038)
  providerSettings: ProviderSettingsTable;

  // Feature flags (migration 014)
  featureFlags: FeatureFlagsTable;

  // Keyword styles (migration 043)
  keywordStyles: KeywordStylesTable;

  // Site settings (migration 048)
  siteSettings: SiteSettingsTable;

  // User preferences (migration 047)
  userPreferences: UserPreferencesTable;
}
