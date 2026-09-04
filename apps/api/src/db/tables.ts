import type {
  DeckCheckCardLine,
  DeckCheckChangeSummary,
  DeckCheckEntryState,
  DeckCheckMatchStatus,
  DeckCheckReviewOutcome,
  PodPenaltyBreakdown,
} from "@openrift/shared";
import type {
  ActivityAction,
  ArtVariant,
  CardFace,
  CardSize,
  CardTradeInitiator,
  CardTradeStatus,
  CardType,
  ContactMethodType,
  CopyLink,
  Currency,
  DeckFormat,
  DeckFormatConfig,
  DeckLink,
  DeckOddsConfig,
  DeckZone,
  FallbackArtMode,
  Finish,
  FriendGroupInviteDirection,
  FriendGroupRole,
  JobStatus,
  JobTrigger,
  ListIntent,
  ListKind,
  ListRuleCombine,
  ListRules,
  LoanStatus,
  Marketplace,
  MarketplaceGroupKind,
  MetaCreditVisibility,
  MetaEventFieldEdits,
  MetaEventOverlayField,
  MetaEventTier,
  MetaEntryStatus,
  MetaListStatus,
  MetaOverlayStatus,
  MetaPlayerOverlayField,
  MetaSourceFetchStatus,
  MetaSubmissionKind,
  MetaSubmissionReason,
  MetaSubmissionStatus,
  OrganizationRole,
  OverlayPayload,
  PodResultStatus,
  PodRoundStatus,
  PodScoringScheme,
  Rarity,
  RuleChangeType,
  RuleKind,
  RuleType,
  StagePresetConfig,
  TournamentClaimSource,
  TournamentDeckPhase,
  TournamentDeckSubmission,
  TournamentHostType,
  TournamentListLockMode,
  TournamentMatchFormat,
  TournamentPairingStyle,
  TournamentParticipantStatus,
  TournamentPlayMode,
  TournamentStaffRole,
  TournamentStatus,
  TradePricePref,
  TradeType,
  UserPreferencesResponse,
} from "@openrift/shared/types";
import type { ColumnType, Generated } from "kysely";

/** Timestamp column that defaults to NOW() on insert. */
type CreatedAt = ColumnType<Date, Date | undefined, Date>;

/** Timestamp column that defaults to NOW() and updates on every write. */
type UpdatedAt = ColumnType<Date, Date | undefined, Date>;

/** CHECK constraints are Zod-validated by setFieldRules in `schemas.ts`. */
export interface SetsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  slug: string;
  /** CHECK: <> '' */
  name: string;
  /** CHECK: >= 0 */
  printedTotal: number | null;
  sortOrder: Generated<number>;
  setType: Generated<"main" | "supplemental">;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** How wide a period a `set_releases.released_at` date stands for. */
type ReleasePrecision = "day" | "month" | "quarter" | "year";

/**
 * When a set reached a given language. One row per
 * (set, language); an absent row means the set is not announced there.
 *
 * There is no stored `released` flag — it is derived from the date, so the
 * two can never disagree. `releasedAt` is the FIRST day of the known period
 * and `precision` says how wide that period is, so a set dated only to
 * "Q2 2026" is expressible. Both NULL means announced with no date yet, which
 * always reads as unreleased.
 */
interface SetReleasesTable {
  /** FK → sets.id, ON DELETE CASCADE */
  setId: string;
  /** FK → languages.code, ON UPDATE CASCADE */
  language: string;
  /** CHECK: NULL exactly when `precision` is, and always its period's first day */
  releasedAt: string | null;
  precision: ReleasePrecision | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Game card — unique by game identity (name + rules). The `slug` is the base
 * printing's source ID (e.g. "OGN-027"). CHECK constraints are Zod-validated
 * by cardFieldRules in `schemas.ts`.
 */
export interface CardsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  slug: string;
  /** CHECK: <> '' */
  name: string;
  normName: Generated<string>;
  /** FK → card_types(slug). Always the first entry of `card_card_types` (position 0). */
  type: CardType;
  /** CHECK: >= 0 */
  might: number | null;
  /** CHECK: >= 0 */
  energy: number | null;
  /** CHECK: >= 0 */
  power: number | null;
  /** CHECK: >= 0 */
  mightBonus: number | null;
  keywords: Generated<string[]>;
  tags: Generated<string[]>;
  /** CHECK: >= 0. Deck copy-limit override; 0 = unlimited (UNLIMITED_COPIES). */
  maxCopiesOverride: number | null;
  /** CHECK: <> '' */
  comment: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** CHECK constraints are Zod-validated by cardErrataFieldRules in `@openrift/shared/db-field-rules`. */
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
  /**
   * `date` column, so the driver hands it back as `"2026-01-01"` rather than a
   * `Date` (see the OID 1082 override in `db/connect.ts`). The write side takes
   * either form because the serializer accepts both, but every caller today
   * passes the day string.
   */
  effectiveDate: ColumnType<string | null, string | Date | null | undefined, string | Date | null>;
  createdAt: CreatedAt;
}

/** CHECK constraints are Zod-validated by printingFieldRules in `schemas.ts`. */
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
  isSigned: Generated<boolean>;
  isOvernumbered: Generated<boolean>;
  /**
   * Sorted slug array maintained by trigger from `printing_markers`.
   * Empty array `{}` means "no markers" (regular printing).
   */
  markerSlugs: Generated<string[]>;
  /** FK → finishes(slug) */
  finish: Finish;
  /** FK → card_sizes(slug). Physical size; defaults to 'standard'. */
  size: Generated<CardSize>;
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
  /** FK → languages(code). Defaults to 'EN'. */
  language: Generated<string>;
  /** CHECK: <> '' */
  printedName: string | null;
  /** Year stamped on the physical card (e.g. 2025). Differs from set release for reprints. */
  printedYear: number | null;
  /**
   * Substitute-art override for a printing with no scan of its own. CHECK:
   * one of 'auto' | 'pinned' | 'none', and 'pinned' iff `fallbackImageFileId`
   * is set.
   */
  fallbackArtMode: Generated<FallbackArtMode>;
  /** FK → image_files(id) ON DELETE RESTRICT. Set exactly when the mode is 'pinned'. */
  fallbackImageFileId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface MarketplaceGroupsTable {
  id: Generated<string>;
  /** CHECK: IN ('tcgplayer', 'cardmarket', 'cardtrader') */
  marketplace: Marketplace;
  groupId: number;
  name: string | null;
  abbreviation: string | null;
  groupKind: Generated<MarketplaceGroupKind>;
  /** FK → sets(id). When set, scopes suggestion auto-matching to that set. */
  setId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Level 2: one row per *SKU* in the upstream marketplace —
 * `(marketplace, external_id, finish, language)`. `language` is NULL when
 * the marketplace doesn't expose language as a SKU dimension (Cardmarket's
 * price guide is cross-language; TCGPlayer sells English-only and treats
 * language as implicit). The unique index is NULLS NOT DISTINCT so CM/TCG
 * can't accidentally get two NULL-language rows for the same pair.
 */
interface MarketplaceProductsTable {
  id: Generated<string>;
  /** CHECK: IN ('tcgplayer', 'cardmarket', 'cardtrader') ; FK composite → marketplace_groups(marketplace, group_id) */
  marketplace: Marketplace;
  /** CHECK: > 0 */
  externalId: number;
  /** FK composite → marketplace_groups(marketplace, group_id) */
  groupId: number;
  /** CHECK: <> '' */
  productName: string;
  /** Normalized `productName`, maintained by a trigger. */
  normName: Generated<string>;
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
interface MarketplaceProductVariantsTable {
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
 * `marketplace_products → marketplace_product_variants`. CHECK constraints
 * are Zod-validated by marketplaceProductPriceFieldRules in `schemas.ts`.
 */
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
interface MarketplaceIgnoredProductsTable {
  /** CHECK: IN ('tcgplayer', 'cardmarket', 'cardtrader') */
  marketplace: Marketplace;
  externalId: number;
  productName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** Level 3 ignores: deny a specific marketplace SKU (identified by product row) from auto-binding. */
interface MarketplaceIgnoredVariantsTable {
  marketplaceProductId: string;
  productName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Pin a specific marketplace SKU to a card, overriding name-based matching.
 * Keyed on the product row so the override survives across price refreshes.
 */
interface MarketplaceProductCardOverridesTable {
  marketplaceProductId: string;
  cardId: string;
  createdAt: CreatedAt;
}

interface AdminsTable {
  userId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** Per-section admin grants — selective, non-full admin access. */
interface AdminGrantsTable {
  userId: string;
  section: string;
  createdAt: CreatedAt;
}

interface UsersTable {
  id: string;
  email: string;
  name: string | null;
  emailVerified: Generated<boolean>;
  image: string | null;
  shareToken: string | null;
  riotId: string | null;
  /**
   * DEFAULT 'hidden'. CHECK: one of 'hidden' / 'name' / 'riot_id'. Whether
   * this user's meta-archive contributions are credited publicly, and which
   * field the credit reads. Consent cannot live on the
   * credit row because the name is resolved at render.
   */
  metaCreditVisibility: Generated<MetaCreditVisibility>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface SessionsTable {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface AccountsTable {
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

interface VerificationsTable {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * better-auth `@better-auth/api-key` plugin table. Owned and
 * written exclusively by the plugin (column names mapped in auth.ts); typed
 * here so scripts can read keys for display.
 */
interface ApiKeysTable {
  id: string;
  configId: Generated<string>;
  name: string | null;
  start: string | null;
  prefix: string | null;
  /** Hash of the key, never the plaintext. */
  key: string;
  referenceId: string;
  refillInterval: number | null;
  refillAmount: number | null;
  lastRefillAt: Date | null;
  enabled: Generated<boolean>;
  rateLimitEnabled: Generated<boolean>;
  rateLimitTimeWindow: number | null;
  rateLimitMax: number | null;
  requestCount: Generated<number>;
  remaining: number | null;
  lastRequest: Date | null;
  expiresAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  permissions: string | null;
  metadata: string | null;
}

/** CHECK constraints are Zod-validated by collectionFieldRules in `schemas.ts`. */
export interface CollectionsTable {
  id: Generated<string>;
  /** Personal collections set user_id; shared collections set group_id. CHECK enforces exactly one. */
  userId: string | null;
  groupId: string | null;
  /** CHECK: <> '' */
  name: string;
  description: string | null;
  isInbox: Generated<boolean>;
  sortOrder: Generated<number>;
  isPublic: Generated<boolean>;
  shareToken: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CopiesTable {
  id: Generated<string>;
  printingId: string;
  collectionId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  /** FK → conditions(slug); null = unrecorded. Mutually exclusive with grading. */
  condition: string | null;
  /** FK → graders(slug); non-null exactly when `grade` is non-null. */
  grader: string | null;
  /** 1 to 10 in half steps. Double precision so postgres.js returns a number. */
  grade: number | null;
  notesPublic: string | null;
  /** Visible to anyone with collection access; stripped from public shares. */
  notesPrivate: string | null;
  isAltered: Generated<boolean>;
  /** JSONB array of { url, label? }. Column default `[]`, so inserts may omit it. */
  links: ColumnType<CopyLink[], CopyLink[] | undefined, CopyLink[]>;
}

/**
 * Per-viewer deck-building availability override for a collection. A row means
 * the user has explicitly chosen whether this collection feeds *their* deck
 * inventory. Absence falls back to a type default of `group_id IS NULL`
 * (personal collections feed decks by default; group collections are opt-in).
 */
interface CollectionDeckbuildingPrefsTable {
  userId: string;
  collectionId: string;
  available: boolean;
}

/**
 * Per-viewer sidebar visibility override for a collection. A
 * row with `hidden = true` pushes the collection behind the sidebar's "Show
 * more" toggle for that user only; absence means visible. Per-viewer because a
 * group collection has many viewers and each curates their own sidebar.
 */
interface CollectionSidebarPrefsTable {
  userId: string;
  collectionId: string;
  hidden: boolean;
}

/**
 * CHECK `chk_collection_events_collection_presence` — each action needs its
 * side identified, by id OR by denormalized name, so an event survives the
 * collection being deleted:
 *   added → to_collection_id or to_collection_name,
 *   removed → from_collection_id or from_collection_name,
 *   moved → one of each pair.
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

/** Action vocabulary for {@link AdminEventsTable}. Enforced here, not by a DB CHECK, so new actions don't need a migration. */
export type AdminEventAction =
  | "card.accept-new"
  | "card.accept-favorites"
  | "card.accept-field"
  | "card.create"
  | "card.rename"
  | "card.delete"
  | "card.link-unmatched"
  | "printing.accept"
  | "printing.accept-favorites"
  | "printing.accept-field"
  | "printing.create"
  | "printing.delete"
  | "printing.fallback-art"
  | "candidate-printing.patch"
  | "candidate-printing.delete"
  | "candidate-printing.copy"
  | "candidate-printing.link"
  | "candidate-printing.relink"
  | "candidate-printing.ignore"
  | "candidate-printing.unignore"
  | "candidate-card.ignore"
  | "candidate-card.unignore"
  | "card-submission.resolution"
  | "image.set-from-candidate"
  | "image.activate"
  | "image.rotate"
  | "image.rehost"
  | "image.unrehost"
  | "image.set-needs-trim"
  | "image.add-url"
  | "image.upload"
  | "image.delete"
  | "errata.upsert"
  | "errata.delete"
  | "errata.upload"
  | "ban.add"
  | "ban.update"
  | "ban.delete"
  | "provider.delete-candidates"
  | "candidates.upload"
  | "meta-overlays.upload"
  | "meta-catalog.accept"
  | "meta-catalog.dismiss"
  | "meta-catalog.undismiss"
  | "meta-catalog.settings"
  | "meta-catalog.template"
  | "meta-catalog.format"
  | "meta-submission.resolve"
  | "meta-submission.reopen";

export type AdminEventEntityType =
  | "card"
  | "printing"
  | "candidate-card"
  | "candidate-printing"
  | "card-submission"
  | "meta-catalog"
  | "meta-catalog-template"
  | "meta-catalog-format"
  | "meta-submission"
  | "image"
  | "errata"
  | "ban"
  | "provider"
  | "upload";

/**
 * Admin audit log (one row per card-catalog admin mutation). Written
 * best-effort after the mutation commits; check/uncheck bookkeeping is
 * deliberately not logged. `actorUserId` has no FK so rows survive user
 * deletion; reads LEFT JOIN users for display names.
 */
interface AdminEventsTable {
  id: Generated<string>;
  actorUserId: string;
  action: AdminEventAction;
  entityType: AdminEventEntityType;
  /** uuid, slug, or composite "provider:externalId"; null for name-keyed events */
  entityId: string | null;
  /** Denormalized human-readable label — stays useful after rename/delete */
  entityLabel: string | null;
  /** Link target for /admin/cards/$cardSlug when resolvable */
  cardSlug: string | null;
  /** jsonb; null for creates. */
  oldValues: Record<string, unknown> | null;
  /** jsonb; null for deletes. */
  newValues: Record<string, unknown> | null;
  createdAt: CreatedAt;
}

/** CHECK constraints are Zod-validated by deckFieldRules in `schemas.ts`. */
export interface DecksTable {
  id: Generated<string>;
  userId: string;
  /** CHECK: <> '' */
  name: string;
  description: string | null;
  /** FK → deck_formats(slug) */
  format: DeckFormat;
  /**
   * Per-deck format config (jsonb). Shape owned by each format's code and
   * enforced at the API boundary by `validateFormatConfig` — readers can
   * trust the type. NULL for formats that have no config (constructed,
   * freeform) or for a format that requires config the user hasn't
   * provided yet (e.g. Custom-Region deck before a region is picked).
   *
   * Current shapes:
   * - `custom-region`: `{"tagSlugs": ["<custom_tags.slug>", ...]}` (one or
   *   more region slugs, OR-matched at validation time) or NULL
   *
   */
  formatConfig: DeckFormatConfig | null;
  /**
   * Per-deck draw-odds settings (jsonb): the owner's custom card groups and
   * the enabled row selection for the test bench's odds table. NULL until
   * customized (suggested defaults apply). Shape enforced at the API boundary
   * by `deckOddsConfigSchema`.
   */
  oddsConfig: DeckOddsConfig | null;
  isPublic: Generated<boolean>;
  shareToken: string | null;
  isPinned: Generated<boolean>;
  archivedAt: Date | null;
  /** FK → cards(id), SET NULL. Custom cover art; null = legend-derived. */
  coverCardId: string | null;
  /** FK → printings(id), SET NULL. Pinned cover printing; null = preferred. */
  coverPrintingId: string | null;
  /** CHECK: 0-100. Vertical crop focus (percent from the top); null = default. */
  coverPosition: number | null;
  /**
   * Outbound links ({@link DeckLink}[]): a guide video, the site the list came
   * from. Hosts are allowlisted at the API boundary. Column default `[]`, so
   * inserts may omit it.
   */
  links: ColumnType<DeckLink[], DeckLink[] | undefined, DeckLink[]>;
  /**
   * FK → collections(id), SET NULL. The deck's home collection: the box it
   * physically lives in. Copies there always count as buildable for this deck,
   * even when the collection is excluded from deck building. Owner-only —
   * never exposed on public/shared deck responses.
   */
  collectionId: string | null;
  /**
   * Groups variants of one deck into a family. NULL for standalone
   * decks; assigned to both rows when a deck gains its first variant. Not an
   * FK — it is a shared opaque id, not a reference to another table.
   */
  familyId: string | null;
  /** FK → decks(id), SET NULL. Lineage: the variant this one was copied from. */
  predecessorDeckId: string | null;
  /**
   * Fronts the family in the deck list. At most one per family
   * (uq_decks_family_primary); meaningless while family_id is NULL.
   */
  isPrimary: Generated<boolean>;
  /** Lifecycle badge only ("still tinkering"); no behavioral rules attach. */
  isDraft: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** CHECK constraints are Zod-validated by deckCardFieldRules in `schemas.ts`. */
export interface DeckCardsTable {
  id: Generated<string>;
  deckId: string;
  cardId: string;
  /** FK → deck_zones(slug) */
  zone: DeckZone;
  /** CHECK: > 0. Defaults to 1. */
  quantity: Generated<number>;
  /** Optional FK → printings(id); pins this row's art to a specific printing. */
  preferredPrintingId: string | null;
}

/**
 * Deck-level plan, 1:1 with a deck. All text fields default to ''
 * and are length-checked at the DB; battlefield FKs are nullable single cards
 * (one battlefield per scenario); Zod-validated by updateDeckPlanSchema in
 * `schemas.ts`.
 */
export interface DeckPlansTable {
  id: Generated<string>;
  deckId: string;
  generalStrategy: Generated<string>;
  mulliganSplit: Generated<boolean>;
  mulliganGeneral: Generated<string>;
  mulliganFirst: Generated<string>;
  mulliganSecond: Generated<string>;
  /** FK → cards(id), nullable; the battlefield chosen for game 1. */
  battlefieldG1CardId: string | null;
  battlefieldFirstCardId: string | null;
  battlefieldSecondCardId: string | null;
  /** When true, `battlefieldNote` free text replaces the per-scenario picks. */
  battlefieldCustom: Generated<boolean>;
  battlefieldNote: Generated<string>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * One opponent matchup within a deck's plan. Identified by an optional linked
 * card (any type) plus a free-text label; a CHECK requires at least one.
 */
export interface DeckMatchupPlansTable {
  id: Generated<string>;
  deckId: string;
  /** FK → cards(id): the opponent's identity card (Legend, Aurora, …). Null for a label-only matchup. */
  opponentCardId: string | null;
  /** Free-text opponent label (archetype / domain / build name). Empty when a card carries the identity. */
  opponentLabel: Generated<string>;
  notes: Generated<string>;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** A sideboard swap for a matchup. CHECK: direction IN ('in','out'); quantity > 0. */
export interface DeckMatchupSwapsTable {
  id: Generated<string>;
  planId: string;
  cardId: string;
  direction: "in" | "out";
  quantity: number;
}

/**
 * User-authored folder for organising the deck list. Flat, and
 * many-to-many with decks via `deck_folder_entries` — a deck may sit in several
 * folders at once. Unrelated to `decks.collectionId`, which is the physical
 * deck box rather than a view grouping.
 */
export interface DeckFoldersTable {
  id: Generated<string>;
  userId: string;
  /** CHECK: <> ''. Unique per user, case-insensitively. */
  name: string;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * One stream overlay per user: the token an OBS browser source
 * polls, and whatever card is currently pushed to it.
 *
 * `version` bumps on every write and becomes the poll's ETag, so an unchanged
 * second costs a 304 with no body.
 *
 * CHECK: jsonb_typeof(payload) = 'object'.
 */
export interface OverlayChannelsTable {
  id: Generated<string>;
  /** FK → users(id), CASCADE. Unique: one channel per user. */
  userId: string;
  /** CHECK: <> ''. Unique. The secret in the OBS browser-source URL. */
  token: string;
  /** Column default `{}`, so inserts may omit it. */
  payload: ColumnType<OverlayPayload, OverlayPayload | undefined, OverlayPayload>;
  version: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * A named bundle of on-screen dressing for the creator tools:
 * the stream overlay and presentation mode. Applying one merges its set fields
 * over whatever the surface already shows, so every field inside `config` is
 * optional and an absent key means "leave that switch alone".
 *
 * `config` is narrowed by the contract's zod schema on the way out, because
 * unlike the payload this blob is presented to the browser source of a stream
 * and a corrupt one must degrade rather than throw.
 *
 * CHECK: name <> ''; jsonb_typeof(config) = 'object'.
 */
export interface StagePresetsTable {
  id: Generated<string>;
  /** FK → users(id), CASCADE. */
  userId: string;
  /** UNIQUE with `userId` (`uq_stage_presets_user_name`) — presets are recalled by name. */
  name: string;
  config: ColumnType<StagePresetConfig, StagePresetConfig | undefined, StagePresetConfig>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Deck ↔ folder membership. PK is (folderId, deckId); `userId` is denormalized
 * so both FKs can be composite against `uq_deck_folders_id_user` and
 * `uq_decks_id_user`, making cross-user membership unrepresentable.
 */
interface DeckFolderEntriesTable {
  folderId: string;
  deckId: string;
  userId: string;
  createdAt: CreatedAt;
}

/** One ranked entry: the card, plus the printing the creator pinned for its art. */
export interface TierListCard {
  cardId: string;
  /** Null falls back to the reader's default printing for the card. */
  printingId: string | null;
}

/** One row of a tier list: a label plus the cards ranked into it, in order. */
export interface TierListRow {
  label: string;
  cards: TierListCard[];
  /**
   * The grey "considered and cut" row, always the last one. Absent on boards
   * saved before it existed, which `normalizeTiers` fills in as false.
   */
  unranked?: boolean;
}

/**
 * Creator-authored tier list. The whole board lives in the
 * `tiers` jsonb because it is only ever read and written whole — rows have no
 * identity beyond their position, so there is nothing for a rows table to key
 * on. Card ids are bare (no FK): the list ranks cards, and one that leaves the
 * catalogue is skipped by the reader rather than blocking the delete.
 *
 * `tiers` is typed as its parsed shape on both sides: postgres.js serializes a
 * jsonb parameter itself, so the value goes in and comes back as an array with
 * nothing to encode or parse at the call site.
 *
 * CHECK: title <> ''; jsonb_typeof(tiers) = 'array'.
 */
export interface TierListsTable {
  id: Generated<string>;
  userId: string;
  title: string;
  description: string | null;
  tiers: Generated<TierListRow[]>;
  isPublic: Generated<boolean>;
  shareToken: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * A slim mirror of uvsgames' whole event listing, one row per catalogued event
 * and roughly a quarter of a million of them. The raw listing row is never
 * stored: an order of magnitude more for no read path.
 *
 * Named and keyed for the one source it mirrors. A second source would not
 * share this shape — every column here is uvsgames' own field — so it would
 * get its own table and its own crawl rather than a `provider` dimension on
 * this one. Candidates are the multi-source layer, and those stay keyed by
 * provider.
 *
 * Triage state is derived rather than stored — an event is "new" when no
 * candidate links its key and it is not ignored — so nothing here says whether
 * the archive wants the event. What is here is what the crawl needs to decide
 * when to look again.
 *
 * The status and format columns hold the source's vocabulary, not ours; the
 * format is mapped to `deck_formats.slug` through {@link
 * UvsgamesFormatMappingsTable}, and an event whose format does not map is never
 * auto-accepted.
 */
export interface UvsgamesEventsTable {
  /** PK. The source's stable id. CHECK: <> '' */
  externalId: string;
  /** CHECK: <> '' */
  name: string;
  startAt: Date;
  endAtEstimate: Date | null;
  /** Source vocabulary: upcoming / inProgress / complete. CHECK: <> ''. */
  displayStatus: string;
  /** Source vocabulary; PUBLISHED is what unlocks the per-deck fetches. */
  decklistStatus: string | null;
  /** CHECK: NULL or >= 0 — an event nobody registered for is a real row. */
  playerCount: number | null;
  eventType: string | null;
  /** Source vocabulary, mapped to `deck_formats.slug` at accept. */
  eventFormat: string | null;
  /** FK → uvsgames_stores.id. Null for a row the source published no keyed store for. */
  storeId: number | null;
  /**
   * The store's name as the listing gave it, kept only as the fallback for a
   * row with no {@link storeId}. Every read resolves the store row first.
   */
  storeName: string | null;
  location: string | null;
  /**
   * The venue's IANA zone. `meta_events.event_date` is the venue-local day of
   * {@link startAt}, and taking the UTC day instead files an evening event in
   * the Americas under the next day.
   */
  timezone: string | null;
  /** Hash of the projection above, so an unchanged row costs one timestamp write. CHECK: <> ''. */
  contentHash: string;
  firstSeenAt: Generated<Date>;
  lastSeenAt: Date;
  /** Set when a covering crawl stopped returning the row. The row is never deleted. */
  missingSince: Date | null;
  /**
   * The source's own event-configuration template, raw. Which templates matter
   * is admin curation, not a constant: see {@link UvsgamesEventTemplatesTable}.
   */
  eventConfigurationTemplate: string | null;
  /**
   * When a results deep fetch last completed for this event. This, not "the
   * mirror holds standings rows", is what the recheck ladder reads: a
   * cancelled event or one with no placements has zero rows forever and must
   * still count as fetched.
   */
  resultsFetchedAt: Date | null;
}

/**
 * One event-configuration template the source publishes. Rows are filled by the
 * sync from the source's own template endpoint, never declared here, so the
 * admin's only input is which templates to watch.
 *
 * Watching a template is what earns it the daily poll query, the badge on the
 * triage list, and the official auto-accept rule.
 *
 * CHECK: `source_name` length 1..200.
 */
interface UvsgamesEventTemplatesTable {
  /** PK. The source's template uuid, verbatim. CHECK: <> '' */
  templateId: string;
  /** The source's own name for it; null for a template the endpoint no longer lists. */
  sourceName: string | null;
  watched: Generated<boolean>;
  /**
   * The admin-curated tier this template's events file under.
   * NULL until an admin maps it; events then get a player-count placeholder.
   */
  tier: MetaEventTier | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * One of the source's format strings, mapped to ours. A row exists only for a
 * format that maps: the archive would rather leave an event in the human queue
 * than file a sealed event as constructed, so an absent row means unmapped and
 * deleting one un-maps it.
 *
 * Lookups normalize both sides through `normalizeFormatKey`, so "Constructed"
 * and "CONSTRUCTED" are one mapping. Nothing in the key stops two rows that
 * normalize alike, so keeping them out is the repository's job on write.
 */
interface UvsgamesFormatMappingsTable {
  /** PK. The source's format string as the listing publishes it. CHECK: <> '' */
  sourceFormat: string;
  /** FK → deck_formats.slug */
  mappedFormat: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * A store as the listing names it. Upserted by every crawl that sees one, so a
 * rename reaches every event it runs instead of being frozen into a quarter of
 * a million rows.
 *
 * The venue columns stay on the event: where a tournament happened is not the
 * same fact as where the store is.
 */
interface UvsgamesStoresTable {
  /** PK. The source's integer store id, from the listing's nested store object. */
  id: number;
  /** CHECK: length 1..200 */
  name: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * A player as the source knows them, keyed on their global user id. Upserted by
 * every deep fetch, so a rename reaches every standings row rather than being
 * snapshotted per event.
 *
 * The archive can still override a name locally: a live standings row carrying
 * its own {@link MetaEventPlayersTable.playerName} wins over this one.
 */
interface UvsgamesPlayersTable {
  /** PK. The source's integer user id, from a registration's `user.id`. */
  id: number;
  /** The source's `best_identifier`. CHECK: length 1..80 */
  displayName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * The recheck queue, one row per accepted event. Split off the mirror because
 * the mirror's other columns are observations of the listing while these two
 * are the crawl's own intent.
 *
 * A null {@link nextCheckAt} is the ladder's terminal state rather than a
 * deleted row: the row's existence records that the event was accepted, and
 * {@link checkStage} still says how far the ladder got.
 */
/**
 * An id a sweep asked about and got no catalogue row for. Riftbound ids are
 * deliberately absent here — those land in `uvsgames_events` instead.
 */
interface UvsgamesIdProbesTable {
  /** PK. Numeric, unlike uvsgames_events.externalId (text). CHECK: > 0. */
  externalId: number;
  /** other_game / absent / unreadable. CHECK: one of those three. */
  outcome: string;
  /** The source's game name for an `other_game` id, else null. CHECK: <> ''. */
  gameType: string | null;
  probedAt: Generated<Date>;
}

interface UvsgamesEventChecksTable {
  /** PK, FK → uvsgames_events.external_id ON DELETE CASCADE. */
  externalId: string;
  /** Null once the ladder is exhausted. */
  nextCheckAt: Date | null;
  /** How far through the decaying recheck ladder this event is. CHECK: >= 0. */
  checkStage: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * A store from the playloltcg registry, the `searchShop` feed
 * (~1,515 rows in one call). It carries structured geography and the only
 * stable store id the source exposes. The event listing omits that id, so an
 * event's {@link PlayloltcgEventsTable.shopId} is filled by the deep fetch from
 * the exact `shopInfoResponse.id` the detail carries, never matched by name.
 */
interface PlayloltcgShopsTable {
  /** PK. The source's integer shop id. */
  id: number;
  /** CHECK: length 1..200 */
  name: string;
  province: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * One playloltcg event, keyed on the source's stable
 * `activityShopId`. The venue columns live here, not on the shop: the source
 * repeats the address per event and an event can run away from the store.
 *
 * `activityType` is a blunt bucket ("符文竞技" spans city qualifiers down to
 * casual nights), so unlike a uvsgames template it is not an accept signal —
 * playloltcg auto-accept is player-count only. It is kept for display and for
 * excluding non-competitive buckets.
 */
export interface PlayloltcgEventsTable {
  /** PK. The source's `activityShopId`. */
  activityShopId: number;
  /**
   * FK → playloltcg_shops.id. The listing never links the shop, so this stays
   * null until the event is deep-fetched — the `activityShop/info` detail
   * carries the exact `shopInfoResponse.id`. Until then {@link shopName} is the
   * fallback, exactly as uvsgames keeps `store_name`.
   */
  shopId: number | null;
  /** The venue name as the listing gave it, the display fallback for a null {@link shopId}. */
  shopName: string | null;
  /** CHECK: length >= 1 */
  name: string;
  activityType: string | null;
  activityTypeName: string | null;
  /** The source's `battleMode`: 1v1, 2v2, 3v3, multi. */
  battleMode: string | null;
  /**
   * The source's `sortWeight` lifecycle, the `display_status` equivalent: 1
   * registration-open, 2 fully-booked, 3 scheduled, 4 in-progress, 5 finished.
   * The recheck ladder fetches results once this reads 5. CHECK: NULL or 1..5.
   */
  status: number | null;
  /**
   * The source publishes day granularity only, so these are `date` columns,
   * handed back as `"2026-08-14"` rather than a `Date` (the OID 1082 override
   * in `db/connect.ts`). The write path passes the same shape.
   */
  startAt: string | null;
  endAt: string | null;
  /** The source's `applyNum` (registered players). CHECK: NULL or >= 0. */
  playerCount: number | null;
  maxUser: number | null;
  /** The source's `applyAmount` (entry fee, in the source's own units). */
  fee: number | null;
  province: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  /** Hash of the projection, so an unchanged row costs one timestamp write. CHECK: <> ''. */
  contentHash: string;
  firstSeenAt: Generated<Date>;
  lastSeenAt: Date;
  /** Set when a covering crawl stopped returning the row. The row is never deleted. */
  missingSince: Date | null;
}

/**
 * The playloltcg recheck queue, one row per accepted event,
 * split from the mirror exactly as {@link UvsgamesEventChecksTable} is.
 */
interface PlayloltcgEventChecksTable {
  /** PK, FK → playloltcg_events.activity_shop_id ON DELETE CASCADE. */
  activityShopId: number;
  /** Null once the ladder is exhausted. */
  nextCheckAt: Date | null;
  /** How far through the decaying recheck ladder this event is. CHECK: >= 0. */
  checkStage: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * The auto-accept rules and sync switches, as one admin-edited row. Global
 * rather than per-source: the player-count rule is the only one both crawled
 * sources run, and the template and notable-name rules only ever applied to
 * uvsgames.
 *
 * CHECK: id = 1 — the singleton is the constraint, not a convention.
 */
interface MetaSyncSettingsTable {
  id: number;
  /** NULL turns the rule off, rather than a threshold nothing meets. CHECK: NULL or > 0. */
  autoAcceptMinPlayers: number | null;
  autoAcceptNotable: Generated<boolean>;
  /** Accepts every event running a template the code recognizes as official. */
  autoAcceptOfficial: Generated<boolean>;
  updatedAt: UpdatedAt;
}

/**
 * One archived competitive event. Admin-curated: there is no
 * submission flow. Metadata is deliberately light — riftdecks-equivalent, not
 * more — so no location, standings, or multi-day representation.
 */
export interface MetaEventsTable {
  id: Generated<string>;
  /** UNIQUE, CHECK: ~ '^[a-z0-9][a-z0-9-]{2,49}$' — mutable, used in URLs, no redirect on rename */
  slug: string;
  /** CHECK: length 1..120 */
  name: string;
  /**
   * `date` column, so the driver hands it back as `"2026-08-14"` rather than a
   * `Date` (see the OID 1082 override in `db/connect.ts`). Multi-day events
   * store the start.
   */
  eventDate: string;
  /** FK → deck_formats.slug — same vocabulary as `decks.format` so filters compose */
  format: string;
  /** CHECK: NULL or > 0 */
  playerCount: number | null;
  /** CHECK: NULL or length 1..120 — free text, e.g. "Riot Games" */
  organizer: string | null;
  /** Markdown. CHECK: NULL or length <= 4000 */
  notes: string | null;
  /**
   * How much the event counts for: premier / competitive / local (CHECK).
   * Classified by rule at ingest (`lib/meta-event-classify.ts`),
   * admin-editable per event. Defaults to `local`, the tier that claims least.
   */
  tier: ColumnType<MetaEventTier, MetaEventTier | undefined, MetaEventTier>;
  /** ISO 3166-1 alpha-2, parsed from the venue address. CHECK: NULL or `~ '^[A-Z]{2}$'`. */
  country: string | null;
  /** The venue address as the source published it. CHECK: NULL or length 1..500. */
  location: string | null;
  // No source key and no source URL on this row: attribution is
  // {@link MetaEventSourcesTable}, which is many-to-one so several sources
  // can feed one event.
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * One player's entry in one archived event. The source publishes the whole
 * field with records for every event and a legend for nearly every one, and a
 * decklist for almost none, so the row that exists per player is this one and a
 * deck is an optional attachment to it.
 *
 * There is no natural key: names collide and ranks tie.
 */
export interface MetaEventPlayersTable {
  id: Generated<string>;
  /** FK → meta_events.id, ON DELETE CASCADE */
  metaEventId: string;
  /** CHECK: >= 1. Ties are legal, so this is indexed with the event but never unique. */
  rank: number;
  /**
   * DEFAULT false. Whether {@link rank} is a cut bucket rather than an exact
   * standing — a tier-only source sets it and the rank displays as "T8".
   */
  rankIsTier: Generated<boolean>;
  /**
   * CHECK: length 1..80. Null only when {@link uvsgamesPlayerId} is set, so
   * the name comes from the source; writing it back is the admin's override.
   * A CHECK enforces that one of the two is always present.
   */
  playerName: string | null;
  /**
   * FK → uvsgames_players.id. UNIQUE with {@link metaEventId} where set, which
   * is what stops one player appearing twice in an event's standings.
   */
  uvsgamesPlayerId: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  /**
   * The standings columns the source sorts on, kept so a rank can be explained
   * and checked rather than only displayed. Which tiebreakers apply is the
   * event's own choice, published alongside the standings; these three are the
   * ones the official source declares (OMWP, GWP, OGWP).
   */
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
  /**
   * CHECK: NULL or one of the {@link MetaEntryStatus} values. NULL for a source
   * that publishes no status, which is every source but the official one.
   */
  entryStatus: MetaEntryStatus | null;
  /**
   * FK → cards.id ON DELETE SET NULL. Held here even when a deck exists, so
   * every surface reads one column whether or not the list was published.
   */
  legendCardId: string | null;
  /** FK → cards.id ON DELETE SET NULL */
  championCardId: string | null;
  /**
   * The identity promotion filed this row under (`u<userId>`,
   * `r<registrationId>`, `p<playerKey>`), UNIQUE with the event where set. A
   * re-promote matches on it, so an overlay renaming the player cannot change
   * which row the source updates. NULL for hand-entered rows and rows minted
   * from overlays. CHECK: NULL or <> ''.
   */
  sourceIdentity: string | null;
  /**
   * FK → meta_event_player_overlays.id ON DELETE SET NULL. Set only on rows
   * promotion minted for an overlay; promotion may delete those and no others.
   */
  mintedByOverlayId: string | null;
  /**
   * UNIQUE FK → decks.id ON DELETE RESTRICT. Deleting an archived deck must
   * not silently take a standings row with it: the admin path clears this and
   * {@link listStatus} first, then deletes the deck.
   */
  deckId: string | null;
  /**
   * DEFAULT 'none'. CHECK: one of the {@link MetaListStatus} values, and
   * CHECK: `(deck_id IS NULL) = (list_status = 'none')`, so a deck and its
   * status can never disagree. See that type for what each state means.
   */
  listStatus: Generated<MetaListStatus>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * One archived match: who sat at one table in one round, and how it ended.
 * Participants are player rows, not source ids, so a
 * second pairings source would land the way standings do. Stored and rendered
 * as per-match facts only; no aggregate is computed from them.
 */
export interface MetaEventMatchesTable {
  id: Generated<string>;
  /** FK → meta_events.id ON DELETE CASCADE */
  metaEventId: string;
  /**
   * The source's own id for this match, and the row's real key: UNIQUE with the
   * event where set. NULL for a hand-entered match or a source that publishes
   * no match id, which is why the seat key below still exists.
   */
  sourceMatchId: string | null;
  /** The source's id for the round, kept as provenance. */
  sourceRoundId: string | null;
  /** DEFAULT 0. CHECK: >= 0. Position of the round's phase (Day 1, Day 2, cut). */
  phaseOrder: Generated<number>;
  /** CHECK: >= 1. The round's position within its phase. */
  roundNumber: number;
  /** Null on byes, where the source sends -1. */
  tableNumber: number | null;
  /** DEFAULT false. CHECK with {@link player2Id}: a bye has exactly one player. */
  isBye: Generated<boolean>;
  isDraw: Generated<boolean>;
  /**
   * FK → meta_event_players.id ON DELETE CASCADE. Participants are ordered
   * deterministically at parse time. UNIQUE with the event, phase, and round
   * for rows with no {@link sourceMatchId}, which is the fallback key: a row
   * that has one is keyed by that instead, so a player the source pairs twice
   * in a round keeps both matches.
   */
  player1Id: string;
  /** FK → meta_event_players.id ON DELETE CASCADE. Null exactly on a bye. */
  player2Id: string | null;
  /** FK → meta_event_players.id ON DELETE CASCADE. CHECK: one of the participants. */
  winnerId: string | null;
  gamesWonP1: number | null;
  gamesWonP2: number | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * One phase of an archived event: the block of rounds the source ran under one
 * structure. `phase_order` is the join to {@link MetaEventMatchesTable}, whose
 * own column carries no meaning without this row.
 *
 * Only the official source publishes phases, so a hand-entered event simply has
 * none and its matches render by round number alone.
 */
export interface MetaEventPhasesTable {
  id: Generated<string>;
  /** FK → meta_events.id ON DELETE CASCADE. UNIQUE with {@link phaseOrder}. */
  metaEventId: string;
  /** CHECK: >= 0. Matches {@link MetaEventMatchesTable.phaseOrder}. */
  phaseOrder: number;
  /** The source's own name for the phase, e.g. "Phase 2". CHECK: NULL or length 1..120. */
  name: string | null;
  /**
   * Source vocabulary, kept raw: `SWISS`, `RANKED_SINGLE_ELIMINATION`. This is
   * what separates a cut from the Swiss rounds before it. CHECK: <> ''.
   */
  roundType: string;
  /** How many rounds the phase was configured for. CHECK: NULL or > 0. */
  roundCount: number | null;
  /**
   * The standing that entered this phase — 8 for a Top 8. The source has a
   * `top_cut_size` field too and leaves it null on every event, so this is
   * where a cut size actually comes from. CHECK: NULL or > 0.
   */
  rankRequired: number | null;
  /**
   * Game wins needed to take a match: 1 for Bo1, 2 for Bo3. Per phase, not per
   * event, because a Bo1 Swiss into a Bo3 cut is a real configuration.
   * CHECK: NULL or > 0.
   */
  maxGameWins: number | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * What the official source published for one registration, projected.
 *
 * Source ids and source vocabulary only: no card is matched, no format mapped
 * and no tier classified here. Promotion owns all three, which is what lets a
 * mapping fix be a re-promote rather than a re-fetch.
 */
export interface UvsgamesEventStandingsTable {
  /** PK part. FK → uvsgames_events.external_id ON DELETE CASCADE */
  externalId: string;
  /** PK part. The source's per-event registration key. CHECK: <> '' */
  registrationId: string;
  /** FK → uvsgames_players.id. Null only where the payload names no keyed user. */
  uvsgamesPlayerId: number | null;
  /** Set only when {@link uvsgamesPlayerId} is not; a CHECK requires one of the two. */
  playerName: string | null;
  /** CHECK: NULL or >= 1. Null while an event is still running. */
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  /** CHECK: NULL or >= 0 */
  matchPoints: number | null;
  /** CHECK: NULL or between 0 and 1 */
  opponentMatchWinPct: number | null;
  /** CHECK: NULL or between 0 and 1 */
  gameWinPct: number | null;
  /** CHECK: NULL or between 0 and 1 */
  opponentGameWinPct: number | null;
  /** CHECK: NULL or one of the {@link MetaEntryStatus} values. */
  entryStatus: MetaEntryStatus | null;
  /** The round standings' `deck_defining_card`, as published. Matched at promotion. */
  legendName: string | null;
  /** The deck this registration references, if any. FK-free: the deck may be unfetchable. */
  sourceDeckId: string | null;
  fetchedAt: CreatedAt;
}

/** The event's phase structure, read from the detail payload. */
export interface UvsgamesEventPhasesTable {
  /** PK part. FK → uvsgames_events.external_id ON DELETE CASCADE */
  externalId: string;
  /** PK part. CHECK: >= 0 */
  phaseOrder: number;
  name: string | null;
  /** Source vocabulary, kept raw: `SWISS`, `RANKED_SINGLE_ELIMINATION`. CHECK: <> ''. */
  roundType: string;
  /** CHECK: NULL or > 0 */
  roundCount: number | null;
  /** CHECK: NULL or > 0 */
  rankRequired: number | null;
  /** CHECK: NULL or > 0 */
  maxGameWins: number | null;
}

/**
 * One completed round's pairings.
 *
 * Participants are ordered deterministically at parse time (by user id), so
 * `(external_id, round_id, player1_uvsgames_id)` is a natural key: one row per
 * round per first-seat player, with a bye keeping its single player in that
 * seat. That avoids trusting an undocumented source match id.
 */
export interface UvsgamesEventMatchesTable {
  /** PK part. FK → uvsgames_events.external_id ON DELETE CASCADE */
  externalId: string;
  /** PK part. The source's round key. CHECK: <> '' */
  roundId: string;
  /**
   * The source's own match id, carried through so the live upsert can key on
   * it. Not part of the PK: the seat key below is what dedupes a re-staged
   * round. CHECK: <> ''.
   */
  sourceMatchId: string;
  /** DEFAULT 0. CHECK: >= 0 */
  phaseOrder: Generated<number>;
  /** CHECK: >= 1 */
  roundNumber: number;
  /** Null on byes, where the source sends -1. */
  tableNumber: number | null;
  /** DEFAULT false. CHECK: true exactly when {@link player2UvsgamesId} is null. */
  isBye: Generated<boolean>;
  /** DEFAULT false */
  isDraw: Generated<boolean>;
  /** PK part. FK → uvsgames_players.id */
  player1UvsgamesId: number;
  /** FK → uvsgames_players.id. Null exactly on a bye. */
  player2UvsgamesId: number | null;
  /** FK → uvsgames_players.id. CHECK: one of the participants. */
  winnerUvsgamesId: number | null;
  gamesWonP1: number | null;
  gamesWonP2: number | null;
}

/**
 * One decklist the source served, or refused to.
 *
 * `fetchStatus` is what makes the accumulate-and-never-retry contract a query
 * rather than a scan: a `refused` deck is never requested again, and an event's
 * deck coverage is a count against its registrations.
 */
export interface UvsgamesDecklistsTable {
  /** PK. The source's deck id. CHECK: <> '' */
  sourceDeckId: string;
  /** FK → uvsgames_events.external_id ON DELETE CASCADE */
  externalId: string;
  /** CHECK: 'fetched' | 'refused' */
  fetchStatus: MetaSourceFetchStatus;
  fetchedAt: CreatedAt;
}

/** One line of a fetched decklist, with the card name exactly as published. */
export interface UvsgamesDecklistCardsTable {
  /** PK part. FK → uvsgames_decklists.source_deck_id ON DELETE CASCADE */
  sourceDeckId: string;
  /** PK part, preserving the published order. CHECK: >= 0 */
  lineNumber: number;
  /** CHECK: <> '' */
  zone: string;
  /** CHECK: > 0 */
  quantity: number;
  /** Never matched here; promotion resolves it. CHECK: <> '' */
  cardName: string;
}

/**
 * The second source's standings.
 *
 * `playerKey` cannot be the placement: the source re-ranks provisional
 * standings into final ones, so a rank-keyed row changes identity between
 * fetches. It is `u<userId>` where the payload carries one, and otherwise the
 * player's name numbered among same-name rows, so a shared name still yields
 * one key per seat.
 */
export interface PlayloltcgEventStandingsTable {
  /** PK part. FK → playloltcg_events.activity_shop_id ON DELETE CASCADE */
  activityShopId: number;
  /** PK part. CHECK: <> '' */
  playerKey: string;
  sourceUserId: number | null;
  /** CHECK: length 1..80 */
  playerName: string;
  /** CHECK: NULL or >= 1 */
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  legendName: string | null;
  sourceDeckId: string | null;
  fetchedAt: CreatedAt;
}

/** See {@link UvsgamesDecklistsTable}; same contract on the second source. */
export interface PlayloltcgDecklistsTable {
  /** PK. CHECK: <> '' */
  sourceDeckId: string;
  /** FK → playloltcg_events.activity_shop_id ON DELETE CASCADE */
  activityShopId: number;
  /** CHECK: 'fetched' | 'refused' */
  fetchStatus: MetaSourceFetchStatus;
  fetchedAt: CreatedAt;
}

/** See {@link UvsgamesDecklistCardsTable}. */
export interface PlayloltcgDecklistCardsTable {
  /** PK part. FK → playloltcg_decklists.source_deck_id ON DELETE CASCADE */
  sourceDeckId: string;
  /** PK part. CHECK: >= 0 */
  lineNumber: number;
  /** CHECK: <> '' */
  zone: string;
  /** CHECK: > 0 */
  quantity: number;
  /** CHECK: <> '' */
  cardName: string;
}

/**
 * A sparse patch on a live event, applied after promotion.
 *
 * Every payload column is nullable and {@link claimedFields} names the ones this
 * row sets. The mask is not redundant with the nulls: without it, "clear the
 * organizer" and "say nothing about the organizer" are the same row. A
 * generated CHECK per column refuses a value that is set without being claimed,
 * so a silently ignored field cannot be stored.
 *
 * An admin's correction and a user's submission are the same shape. What
 * differs is {@link submittedByUserId} and {@link status}: an admin writes one
 * already `accepted`, a user's waits for review.
 */
export interface MetaEventOverlaysTable {
  id: Generated<string>;
  /** FK → meta_events.id ON DELETE CASCADE. NULL proposes a new event. */
  metaEventId: string | null;
  /** Set for push providers, NULL for people. UNIQUE with {@link externalId}. */
  provider: string | null;
  /** NULL together with {@link provider}; a CHECK ties the two. */
  externalId: string | null;
  /** CHECK: NULL or length 1..120 */
  name: string | null;
  /** ISO `YYYY-MM-DD`. */
  eventDate: string | null;
  /** CHECK: NULL or <> '' */
  format: string | null;
  /** CHECK: NULL or > 0 */
  playerCount: number | null;
  /** CHECK: NULL or length 1..120 */
  organizer: string | null;
  /** CHECK: NULL or length <= 4000 */
  notes: string | null;
  /** CHECK: NULL or one of the {@link MetaEventTier} values. */
  tier: MetaEventTier | null;
  /** CHECK: NULL or ISO 3166-1 alpha-2. */
  country: string | null;
  /** CHECK: NULL or length 1..500 */
  location: string | null;
  /** CHECK: non-empty, and every element in {@link MetaEventOverlayField}. */
  claimedFields: MetaEventOverlayField[];
  /** DEFAULT 'pending'. CHECK: one of the {@link MetaOverlayStatus} values. */
  status: Generated<MetaOverlayStatus>;
  /** FK → users.id. `meta-archive` for anything automation writes. */
  submittedByUserId: string;
  /** CHECK: <> '' */
  submissionNote: string | null;
  /** CHECK: set exactly when {@link status} is 'accepted'. */
  acceptedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * A sparse patch on a live standings row. See {@link MetaEventOverlaysTable}
 * for how the mask works.
 *
 * Exactly one target is set. {@link metaEventPlayerId} patches an existing
 * standings row, which is what a decklist submission for someone the archive
 * already lists does. {@link metaEventId} proposes a new player under a live
 * event. {@link eventOverlayId} proposes one under an event that is itself
 * still only proposed, which is how a push provider or a user submits a whole
 * event and its field in one go: accepting the event overlay mints the live row
 * and these follow it.
 */
export interface MetaEventPlayerOverlaysTable {
  id: Generated<string>;
  /** FK → meta_event_players.id ON DELETE CASCADE. Patches that row. */
  metaEventPlayerId: string | null;
  /** FK → meta_events.id ON DELETE CASCADE. Proposes a new player under it. */
  metaEventId: string | null;
  /** FK → meta_event_overlays.id ON DELETE CASCADE. See the note above. */
  eventOverlayId: string | null;
  /** CHECK: NULL or length 1..80 */
  playerName: string | null;
  /** CHECK: NULL or >= 1 */
  rank: number | null;
  rankIsTier: boolean | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  /** CHECK: NULL or >= 0 */
  matchPoints: number | null;
  /** CHECK: NULL or between 0 and 1 */
  opponentMatchWinPct: number | null;
  /** CHECK: NULL or between 0 and 1 */
  gameWinPct: number | null;
  /** CHECK: NULL or between 0 and 1 */
  opponentGameWinPct: number | null;
  /** CHECK: NULL or one of the {@link MetaEntryStatus} values. */
  entryStatus: MetaEntryStatus | null;
  /** FK → cards.id ON DELETE SET NULL */
  legendCardId: string | null;
  /** FK → cards.id ON DELETE SET NULL */
  championCardId: string | null;
  /** CHECK: NULL or one of the {@link MetaListStatus} values. */
  listStatus: MetaListStatus | null;
  /**
   * Set with {@link sourcePlayerKey} for push-provider rows (a CHECK ties the
   * two), so a re-upload updates its rows instead of duplicating them. NULL
   * for user submissions and admin corrections.
   */
  provider: string | null;
  /**
   * The provider's own key for the standings row, `<eventExternalId>:<playerExternalId>`.
   * UNIQUE with {@link provider} where set, and stable across the overlay
   * being re-anchored when its proposed event is accepted.
   */
  sourcePlayerKey: string | null;
  /** CHECK: non-empty, and every element in {@link MetaPlayerOverlayField}. */
  claimedFields: MetaPlayerOverlayField[];
  /** DEFAULT 'pending'. CHECK: one of the {@link MetaOverlayStatus} values. */
  status: Generated<MetaOverlayStatus>;
  /** FK → users.id. `meta-archive` for anything automation writes. */
  submittedByUserId: string;
  /** CHECK: <> '' */
  submissionNote: string | null;
  /** CHECK: set exactly when {@link status} is 'accepted'. */
  acceptedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * The card list an overlay proposes, claimed by its `cards` field.
 *
 * Rows rather than jsonb, so {@link cardId} carries a real foreign key and
 * "which pending lists hold a name that resolves to nothing" is a query.
 */
export interface MetaEventPlayerOverlayCardsTable {
  /** PK part. FK → meta_event_player_overlays.id ON DELETE CASCADE */
  overlayId: string;
  /** PK part, preserving the submitted order. CHECK: >= 0 */
  lineNumber: number;
  /** A `WellKnown.deckZone` value. CHECK: <> '' */
  zone: string;
  /** CHECK: > 0 */
  quantity: number;
  /** What the submitter wrote, kept even once it resolves. CHECK: <> '' */
  cardName: string;
  /** FK → cards.id ON DELETE SET NULL. Null while the name matches nothing. */
  cardId: string | null;
  /**
   * FK → printings.id ON DELETE SET NULL. Set by admin edits pasted from a
   * deck code, so the exact printings survive the overlay layer.
   */
  preferredPrintingId: string | null;
}

/**
 * A source event the admin dismissed. Skipped at sync and at promotion, so
 * the same key never re-enters the queue. The source key is the identity:
 * there is no surrogate id.
 */
interface IgnoredMetaSourceEventsTable {
  /** PK part. CHECK: <> '' */
  provider: string;
  /** PK part. CHECK: <> '' */
  externalId: string;
  createdAt: CreatedAt;
}

/**
 * A dismissed source player. Keyed on the source's event id as well as the
 * player's, because player external ids are only unique within their event.
 *
 * An ignore marks the key and leaves the mirror row in place, live link
 * included, so un-ignoring and re-fetching resolves to the same live rows
 * instead of creating a duplicate.
 */
interface IgnoredMetaSourcePlayersTable {
  /** PK part. CHECK: <> '' */
  provider: string;
  /** PK part. The source's id for the player's event. CHECK: <> '' */
  eventExternalId: string;
  /** PK part. CHECK: <> '' */
  externalId: string;
  createdAt: CreatedAt;
}

/**
 * Where an event's data came from, one row per source. This is
 * a citation, public and printed on the event page. It never carries a user: a
 * contributor is credited through {@link MetaCreditsTable} instead.
 *
 * A provider row is written when the provider's event is accepted into the
 * archive, so a linked source is credited even when an overlay overrides every
 * field it published. A hand-entered row leaves the key NULL, for an admin
 * transcribing from a VOD or a photo of the standings board.
 */
export interface MetaEventSourcesTable {
  id: Generated<string>;
  /** FK → meta_events.id ON DELETE CASCADE */
  metaEventId: string;
  /** NULL together with {@link externalId} for a hand-entered citation. CHECK: <> ''. */
  provider: string | null;
  /** The provider's own id for the event. See {@link provider}. */
  externalId: string | null;
  /** What the event page prints, e.g. "uvsgames" or "Twitch VOD". CHECK: length 1..60. */
  label: string;
  /** CHECK: NULL or length 1..2000. A back-reference, never a fetch target. */
  sourceUrl: string | null;
  /**
   * DEFAULT 0. Promotion applies the linked sources in this order, lowest
   * first, so the highest number wins any field two sources both hold. Taking
   * one field from a lower-priority source is an overlay, not a second knob.
   */
  priority: Generated<number>;
  createdAt: CreatedAt;
}

/**
 * One contribution by a signed-in user, written in the same transaction as the
 * accept it belongs to. Never written for provider ingest or
 * hand entry.
 *
 * The row holds the user id and nothing else on purpose: a credit points at a
 * person, so it follows their rename, their profile fields, and their account
 * deletion with no sweep across rows. Whether it is shown is
 * `users.meta_credit_visibility`, read at render.
 */
interface MetaCreditsTable {
  id: Generated<string>;
  /** FK → meta_events.id ON DELETE CASCADE */
  metaEventId: string;
  /** FK → meta_event_players.id ON DELETE CASCADE. NULL credits the event itself. */
  metaEventPlayerId: string | null;
  /** FK → users.id ON DELETE CASCADE — deleting an account removes its credits. */
  userId: string;
  createdAt: CreatedAt;
}

/**
 * The outcome ledger for user decklist submissions, shaped
 * like `card_submissions`. Provider uploads get none: those sources
 * are the maintainer's own tooling, and staging's presence semantics suffice.
 *
 * Every FK out of this row is ON DELETE SET NULL except the submitter's, so
 * the ledger keeps reading correctly after the overlay is accepted, the
 * target event is deleted, or the deck is removed.
 */
export interface MetaSubmissionsTable {
  id: Generated<string>;
  /** FK → users.id ON DELETE CASCADE */
  userId: string;
  /** CHECK: <> '' — `usersubmission` today, matching the overlay's provider. */
  provider: string;
  /** CHECK: <> '' — per-submission id, UNIQUE with {@link provider}. */
  externalId: string;
  /** FK → meta_event_player_overlays.id ON DELETE SET NULL — what this submission wrote. */
  playerOverlayId: string | null;
  /** FK → meta_events.id ON DELETE SET NULL — the event this targets, when it has one. */
  metaEventId: string | null;
  /** What the submitter called the event, so the row still reads without a target. CHECK: length 1..120. */
  eventName: string;
  /** CHECK: length 1..80, and NULL exactly when {@link kind} is 'event_correction'. */
  playerName: string | null;
  /** DEFAULT 'new_list'. CHECK: one of the {@link MetaSubmissionKind} values. */
  kind: Generated<MetaSubmissionKind>;
  /**
   * The new values an event correction proposes, keyed as the event's own
   * fields. CHECK: a jsonb object, and only on the 'event_correction' kind.
   */
  fieldEdits: MetaEventFieldEdits | null;
  /** The submitter's own note. CHECK: <> ''. */
  note: string | null;
  /** DEFAULT 'pending'. CHECK: one of the {@link MetaSubmissionStatus} values. */
  status: Generated<MetaSubmissionStatus>;
  /** CHECK: NULL or one of the {@link MetaSubmissionReason} values. */
  resolutionReason: MetaSubmissionReason | null;
  /** What the admin told the submitter. CHECK: <> ''. */
  resolutionNote: string | null;
  /** CHECK: set exactly when {@link status} is not 'pending'. */
  resolvedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  /** FK → users.id ON DELETE SET NULL */
  resolvedByUserId: string | null;
  /** FK → decks.id ON DELETE SET NULL — the archived deck an accept produced. */
  acceptedDeckId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * `intent` is the surface (wish / trade / organize). `kind` is the granularity
 * the list tracks: a list contains uniformly cards, printings, or copies.
 * The intent × kind matrix is constrained:
 *   wish     → card | printing
 *   trade    → copy
 *   organize → card | printing | copy
 *
 * CHECK: intent ∈ ('wish','trade','organize'); kind ∈ ('card','printing','copy');
 * intent × kind matches one of the six allowed combos; name <> ''.
 */
export interface ListsTable {
  id: Generated<string>;
  userId: string;
  name: string;
  intent: ListIntent;
  kind: ListKind;
  isPublic: Generated<boolean>;
  shareToken: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  /** List-level default for entries that don't override. */
  defaultPricePref: TradePricePref | null;
  /** Set iff defaultPricePref === 'absolute'. Positive integer. */
  defaultPriceAbsoluteCents: number | null;
  defaultTradeType: TradeType | null;
  /** Required for any 'absolute' default or override; ignored otherwise. */
  currency: Currency | null;
  sortOrder: Generated<number>;
  /**
   * Pushes the list behind the sidebar's "Show more" toggle. A
   * plain column (not a per-viewer table like collections use) because a list
   * has exactly one viewer, its owner.
   */
  sidebarHidden: Generated<boolean>;
  /**
   * Dynamic rules (jsonb array). Typed as the parsed shape on both
   * sides — the repo passes the array straight through and postgres.js does the
   * serializing, guarded by a `jsonb_typeof(rules) = 'array'` CHECK. NOT NULL
   * with a `'[]'` default, so insert may omit it. Empty array = manual-only list.
   */
  rules: ColumnType<ListRules, ListRules | undefined, ListRules>;
  /**
   * How several rules combine. NULL = the
   * intent's default (wish: sum, trade: protect). CHECK constrains the slugs.
   */
  ruleCombine: ListRuleCombine | null;
}

/**
 * Single-granularity entry matching the parent list's kind:
 *   kind = 'card'     → card_id set, printing_id/copy_id NULL
 *   kind = 'printing' → printing_id set, card_id/copy_id NULL
 *   kind = 'copy'     → copy_id set, card_id/printing_id NULL
 *
 * The composite FK (list_id, kind) → lists(id, kind) enforces that an
 * entry's kind matches its parent list's kind at the DB layer.
 */
export interface ListEntriesTable {
  id: Generated<string>;
  listId: string;
  userId: string;
  kind: ListKind;
  cardId: string | null;
  printingId: string | null;
  copyId: string | null;
  /** CHECK: > 0 */
  quantity: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  /** Per-entry override. NULL = inherit parent list default. */
  pricePref: TradePricePref | null;
  /** Set iff pricePref === 'absolute'. */
  priceAbsoluteCents: number | null;
  tradeType: TradeType | null;
}

export interface FriendGroupsTable {
  id: Generated<string>;
  /** CHECK: matches `^[a-z0-9][a-z0-9-]{2,29}$` */
  slug: string;
  /** The slug this group last renamed away from — kept as a lookup alias so
   * bookmarks and in-flight trade emails keep resolving. Same CHECK as slug. */
  previousSlug: string | null;
  /** CHECK: length 1..60 */
  name: string;
  /** CHECK: length <= 500 */
  description: string | null;
  /** Nullable disables code-based joining; unique where not null. */
  code: string | null;
  codeRotatedAt: ColumnType<Date, Date | undefined, Date>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface FriendGroupMembersTable {
  groupId: string;
  userId: string;
  role: FriendGroupRole;
  joinedAt: ColumnType<Date, Date | undefined, Date>;
}

/** Account-level contact channels a user can reveal per group. */
interface UserContactMethodsTable {
  id: Generated<string>;
  userId: string;
  /** CHECK: one of the known contact channels. */
  type: ContactMethodType;
  /** CHECK: length 1..200. */
  value: string;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** Which of a member's contact methods are revealed to a given group. */
interface FriendGroupMemberContactsTable {
  groupId: string;
  userId: string;
  contactMethodId: string;
}

export interface FriendGroupInvitesTable {
  id: Generated<string>;
  groupId: string;
  userId: string;
  direction: FriendGroupInviteDirection;
  createdAt: CreatedAt;
}

export interface FriendGroupListSharesTable {
  groupId: string;
  listId: string;
  userId: string;
  sharedAt: ColumnType<Date, Date | undefined, Date>;
}

export interface FriendGroupCollectionSharesTable {
  groupId: string;
  collectionId: string;
  userId: string;
  sharedAt: ColumnType<Date, Date | undefined, Date>;
}

/**
 * A Discord server linked to a friend group. Pending rows
 * carry a one-time `code` (guild fields null); redeeming the code via the
 * bot's /link command sets `guildId`/`guildName`/`linkedAt` and clears the
 * code. CHECK: exactly one of `guildId` / `code` is set.
 */
export interface FriendGroupDiscordLinksTable {
  id: Generated<string>;
  groupId: string;
  /** Discord guild snowflake; unique where not null. */
  guildId: string | null;
  guildName: string | null;
  /** One-time link code; unique where not null; requires codeExpiresAt. */
  code: string | null;
  codeExpiresAt: Date | null;
  createdByUserId: string | null;
  createdAt: CreatedAt;
  linkedAt: Date | null;
  /** Channels of the linked guild the bot scans for card names. */
  tradeChannelIds: Generated<string[]>;
}

// A first-class tournament host alongside users (a local game store, a league).
// Admin-provisioned. `organization_members` carries org-level authority; both
// `owner` and `manager` are implicit organizers on every tournament the org hosts.
// Ownership is the `role = 'owner'` membership rows alone; a
// deferred constraint trigger keeps every org at one owner or more.

export interface OrganizationsTable {
  id: Generated<string>;
  /** CHECK: ^[a-z0-9][a-z0-9-]{2,49}$; UNIQUE */
  slug: string;
  /** CHECK: length 1..120 */
  name: string;
  /** CHECK: NULL or length <= 4000 */
  description: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface OrganizationMembersTable {
  orgId: string;
  userId: string;
  /**
   * CHECK: 'owner' | 'manager' | 'judge'. Owner and manager both inherit
   * organizer authority on every tournament the org hosts; judge does not.
   * An org may have several `owner` members. `organizations.owner_user_id`
   * names the primary one, whom `fk_organizations_owner_membership`
   * keeps a member of the org — the pointer is constrained to a
   * membership row, not to one carrying the owner role.
   */
  role: OrganizationRole;
  joinedAt: CreatedAt;
}

// One entity composing any subset of {pairing engine, deck submission,
// deck check, judges} under a user or organization host, optionally linked to a
// friend group. The pairing module keeps a lean derive-on-read model:
// pod_players carries no aggregate columns and there is no pod_opponents table;
// score, pod tallies, rounds played, and opponent counts are derived on read
// from finalized rounds. Stored: raw facts (placement) and write-once outputs.

export interface TournamentsTable {
  id: Generated<string>;

  // Host: exactly one of user / organization (CHECK chk_tournaments_host).
  hostType: TournamentHostType;
  hostUserId: string | null;
  hostOrgId: string | null;

  /** Optional friend-group association — visibility only, NOT ownership. */
  groupId: string | null;

  /** CHECK: length 1..120 */
  name: string;
  /** CHECK: IN ('setup', 'running', 'completed', 'cancelled') */
  status: Generated<TournamentStatus>;
  /** When the tournament takes place. Defaults to now() for non-wizard create paths. */
  startsAt: Generated<Date>;
  /** Optional end instant: a set value pins a multi-day close or an early finish. */
  endsAt: Date | null;

  // The pairing engine. 'none' = no rounds; 'pod' = pod rounds; 'swiss' = 1v1 matches.
  pairingStyle: Generated<TournamentPairingStyle>;
  /**
   * 1v1 or 2v2 team play, orthogonal to the pairing style. CHECKs reject
   * 2v2 + pod pairing and 2v2 + regions (chk_tournaments_play_mode_*).
   */
  playMode: Generated<TournamentPlayMode>;
  currentRound: Generated<number>;
  scoringScheme: Generated<PodScoringScheme>;
  /** Score points a sat-out (bye) game is worth; CHECK >= 0. Defaults to 3. */
  byePoints: Generated<number>;
  /** Swiss result entry (Bo1/Bo3); CHECK chk_tournaments_match_format. Defaults to 'bo1'. */
  matchFormat: Generated<TournamentMatchFormat>;
  /** Swiss match-win points; CHECK >= 0. Defaults to 3. Derived on read, so editable anytime. */
  winPoints: Generated<number>;
  /** Swiss draw points per player; CHECK >= 0. Defaults to 1. */
  drawPoints: Generated<number>;
  /** Region layer: participant regions, region-aware pairing, region standings. */
  regionsEnabled: Generated<boolean>;

  // Deck-submission module (submission always produces a full deck-check entry).
  deckSubmission: Generated<TournamentDeckSubmission>;

  // Deck phase, orthogonal to status; drives submissions, not pairing.
  deckPhase: Generated<TournamentDeckPhase>;
  submissionsCloseAt: Date | null;
  listLockMode: Generated<TournamentListLockMode>;
  /** Deck-legality format (a deck_formats slug) — NOT the pairing `format`. */
  deckFormat: string | null;
  /** Set codes for set-legality flagging. */
  allowedSets: string[] | null;
  selfRegistration: Generated<boolean>;

  /** Pod follow-along + result entry. Unique where not null. */
  reportToken: string | null;
  /** Read-only pod follow-along (no result entry). Unique where not null. */
  followToken: string | null;
  /** Open self-submission / registration link. Unique where not null. */
  submissionToken: string | null;
  /** Reusable staff-invite link that grants `organizer`. Unique where not null. */
  organizerInviteToken: string | null;
  /** Reusable staff-invite link that grants `judge`. Unique where not null. */
  judgeInviteToken: string | null;

  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// Per-tournament staff, decoupled from friend-group roles. Not exported: only
// the Database interface references it; no module derives a Selectable<> here.
interface TournamentStaffTable {
  tournamentId: string;
  userId: string;
  /** CHECK: 'organizer' | 'judge' */
  role: TournamentStaffRole;
  addedAt: CreatedAt;
}

// A fixed 2v2 team. Identity only: membership rides on
// tournament_participants.team_id, and the display name derives from the two
// member names. Deleting the row dissolves the team (members SET NULL).
// Not exported: only the Database interface references it.
interface TournamentTeamsTable {
  id: Generated<string>;
  tournamentId: string;
  createdAt: CreatedAt;
}

// Unified participant: walk-in name → invited/claimable email → linked
// account. Pairing reads only id/status; the identity + claim columns are
// dormant for a plain pod tournament.
export interface TournamentParticipantsTable {
  id: Generated<string>;
  tournamentId: string;
  /** Nullable linked account; UNIQUE per (tournamentId, userId) where not null. */
  userId: string | null;
  /** CHECK: length 1..120 */
  displayName: string;
  /** CHECK: NULL or length <= 120 */
  riotId: string | null;
  // Full participant lifecycle (requested/invited/active/dropped/no_show).
  // The pod-engine surfaces only accept the roster subset (PodPlayerStatus);
  // their repo queries filter to it in SQL and $narrowType the rows.
  status: Generated<TournamentParticipantStatus>;
  /** Round number after which the player was dropped; NULL while active. */
  droppedAfterRound: number | null;
  seed: number | null;
  /**
   * The participant's fixed 2v2 team (SET NULL when the team dissolves).
   * Always NULL in 1v1 play. Exactly-two-members is service-enforced.
   */
  teamId: string | null;
  /** Region tag slug (custom-tag category 'region'); CHECK: NULL or length 1..50. */
  region: string | null;
  /**
   * Physical table this player is normally seated at; CHECK: NULL or 1..999.
   * Soft: steers post-pairing table assignment only, never who plays whom.
   */
  fixedTable: number | null;
  claimSource: TournamentClaimSource | null;
  /** UNIQUE where not null; resolves a claim link to one participant. */
  claimToken: string | null;
  claimedAt: Date | null;
  /** Unlink tombstone: blocks auto-match after a host unlink. */
  claimBlockedAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PodRoundsTable {
  id: Generated<string>;
  tournamentId: string;
  /** CHECK: > 0; UNIQUE per (tournamentId, roundNumber) */
  roundNumber: number;
  status: Generated<PodRoundStatus>;
  /** The engine's whole-round penalty (write-once). */
  penaltyTotal: number;
  /** Which engine produced it: 'random' (round 1) or 'local-search'. */
  pairingStrategy: string;
  createdAt: CreatedAt;
  finalizedAt: Date | null;
}

export interface PodsTable {
  id: Generated<string>;
  roundId: string;
  /** CHECK: > 0; UNIQUE per (roundId, podNumber) */
  podNumber: number;
  /** CHECK: 2, 3 or 4 (2 = a Swiss 1v1 match) */
  size: number;
  /** Engine's write-once penalty breakdown. */
  penaltyBreakdown: PodPenaltyBreakdown;
  resultStatus: Generated<PodResultStatus>;
}

// Not exported: only the Database interface below references it; no module derives a
// Selectable<> type from it (unlike the sibling pod tables), so knip flags a public export.
interface PodMembersTable {
  podId: string;
  playerId: string;
  /** 1-based; ties share a value; NULL until the pod is reported. Derived from gamePoints. */
  placement: number | null;
  /** Raw game points the player ended the pod on; CHECK >= 0; NULL until reported. */
  gamePoints: number | null;
  /**
   * 0-based seat around the table; CHECK: NULL or 0..3. Chosen at round
   * creation to vary neighbors versus earlier rounds; NULL on rounds persisted
   * before the seating feature.
   */
  seat: number | null;
}

// Byes. A row records that a player sat a round out; the score
// it is worth is the tournament's bye_points (derived on read — no points
// column). Manual only. Not exported for the same reason as PodMembersTable: no
// module derives a Selectable<> from it.
interface PodByesTable {
  roundId: string;
  playerId: string;
}

// A deck-check tournament is `tournaments` that collects decklists
// (deck_submission <> 'none'). Per-person identity + claim columns live
// on tournament_participants; the entry keeps the decklist + verification state
// and references its tournament + participant.

export interface DeckCheckEntriesTable {
  id: Generated<string>;
  tournamentId: string;
  /** The participant this decklist belongs to; CASCADE — removing the participant deletes this entry. */
  participantId: string | null;
  /** Provider's upsert key; UNIQUE per (tournamentId, externalId). */
  externalId: string;
  submittedAt: Date | null;
  /** Consent for the organizer to publish the deck list publicly (default true, opt-out). */
  allowDeckPublishing: Generated<boolean>;
  /** Consent to show the player's name on public platforms (default true, opt-out). */
  allowNameSharing: Generated<boolean>;
  /** Consent to show the player's Riot ID on public platforms (default true, opt-out). */
  allowRiotIdSharing: Generated<boolean>;
  /** Hash over the normalized card lines; unchanged re-push is a no-op. */
  contentHash: string;
  /** Lifecycle state; the player edits only in 'editable'. */
  state: Generated<DeckCheckEntryState>;
  /** How the most recent judge review went; null until a judge reviewed. */
  reviewOutcome: DeckCheckReviewOutcome | null;
  checkedBy: string | null;
  checkedAt: Date | null;
  /** Pre-event list approval, separate from the event-day check. */
  approvedBy: string | null;
  approvedAt: Date | null;
  /** Player request to unlock an approved entry; a judge grants or declines. */
  unlockRequestedAt: Date | null;
  /** The list as the judge last saw it. */
  preEditLines: DeckCheckCardLine[] | null;
  /** CHECK: length <= 4000 */
  notes: string | null;
  /** Diff vs the last judge-reviewed list. */
  changeSummary: DeckCheckChangeSummary | null;
  withdrawnAt: Date | null;
  /** CHECK: length <= 2000; judge-authored, shown to the linked player. */
  playerMessage: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DeckCheckEntryCardsTable {
  id: Generated<string>;
  entryId: string;
  sortOrder: number;
  /** Provider text kept verbatim; resolution is a cache, this is the record. */
  rawName: string;
  /** Provider's own zone string, before mapping. */
  section: string;
  zone: string;
  /** CHECK: > 0 */
  quantity: number;
  resolvedCardId: string | null;
  /** Canonical printing chosen purely to source a thumbnail. */
  resolvedPrintingId: string | null;
  matchStatus: DeckCheckMatchStatus;
  /**
   * Per-copy found ticks, 1-based sparse array (CHECK: cardinality <= quantity).
   * May be shorter than quantity and contain NULL padding; absent = not found.
   */
  foundCopies: Generated<(boolean | null)[]>;
}

export interface DeckCheckKeysTable {
  id: Generated<string>;
  // Exactly one of user / organization (CHECK chk_deck_check_keys_host), so a
  // host's keys span all its tournaments.
  hostType: TournamentHostType;
  hostUserId: string | null;
  hostOrgId: string | null;
  /** SHA-256 of the plaintext token; the plaintext is never persisted. */
  tokenHash: string;
  /** First chars of the plaintext, display only. */
  tokenPrefix: string;
  /** CHECK: length <= 120 */
  label: string | null;
  createdBy: string | null;
  createdAt: CreatedAt;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface CardTradesTable {
  id: Generated<string>;
  /**
   * CHECK: exactly one of groupId / groupName is set. The id while the friend
   * group exists, the snapshotted name once it is deleted, so a
   * finished trade keeps saying where it happened. Deleting a group cancels its
   * live trades, so a NULL here always means the trade is terminal.
   */
  groupId: string | null;
  /** CHECK: <> '' when set. Set only for a deleted group. */
  groupName: string | null;
  /**
   * Owns the copies (supply / tradelist side). Exactly one of giverUserId /
   * giverName is set: the id while the account exists, the snapshotted display
   * name once it is deleted.
   */
  giverUserId: string | null;
  /** CHECK: <> '' when set. Set only for a deleted giver. */
  giverName: string | null;
  /** Wants the card (demand / wishlist side). Same shape as the giver pair. */
  receiverUserId: string | null;
  /** CHECK: <> '' when set. Set only for a deleted receiver. */
  receiverName: string | null;
  initiator: CardTradeInitiator;
  printingId: string;
  /** Denormalised from the printing, for grouping/display. */
  cardId: string;
  /** CHECK: > 0 */
  quantity: number;
  status: Generated<CardTradeStatus>;
  /** Demand-side sync target; SET NULL if the wish entry is deleted. */
  receiverWishEntryId: string | null;
  /** Who caused the most recent transition; NULL = system (cron expiry). */
  lastActorUserId: string | null;
  giverSyncAppliedAt: Date | null;
  receiverSyncAppliedAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  acceptedAt: Date | null;
  completedAt: Date | null;
  /** declined / cancelled / expired */
  closedAt: Date | null;
  /** pending TTL (created_at + 24h); cleared once not pending. */
  expiresAt: Date | null;
  /**
   * Coalescing marker: when the recipient was emailed about this
   * request (instant or coalesced), or when it was suppressed (opted out).
   * NULL = still queued, awaiting the flush cron.
   */
  requestEmailSentAt: Date | null;
  /**
   * Status-email marker: when the initiator was emailed that the trade
   * was accepted (reserved), or when it was suppressed. NULL while `status =
   * 'reserved'` = still queued for the trade-status flush.
   */
  reservedEmailSentAt: Date | null;
  /**
   * Status-email marker: when the non-actor was emailed that the trade
   * was declined or cancelled, or when it was suppressed. NULL while `status IN
   * ('declined','cancelled')` = still queued for the trade-status flush.
   */
  closedEmailSentAt: Date | null;
}

interface CardTradeCopiesTable {
  tradeId: string;
  copyId: string;
}

export interface LoansTable {
  id: Generated<string>;
  /** Owns the copies; the loan is their personal ledger entry. */
  lenderUserId: string;
  /**
   * CHECK: exactly one of borrowerUserId / borrowerName is set. A member
   * borrower who deletes their account leaves the id NULL and their display
   * name snapshotted into borrowerName, which is the same shape
   * an off-platform borrower has from the start.
   */
  borrowerUserId: string | null;
  /** CHECK: <> '' when set. */
  borrowerName: string | null;
  printingId: string;
  /** Denormalised from the printing, for grouping/display. */
  cardId: string;
  /** CHECK: > 0 */
  quantity: number;
  /** CHECK: 0 <= returned_quantity <= quantity; = quantity when status 'returned'. */
  returnedQuantity: Generated<number>;
  status: Generated<LoanStatus>;
  /** Member-borrower consent, orthogonal to status; mutually exclusive with rejectedAt. */
  acknowledgedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  /** returned / written_off */
  closedAt: Date | null;
}

interface LoanCopiesTable {
  loanId: string;
  copyId: string;
}

/** CHECK constraints are Zod-validated by candidateCardFieldRules in `schemas.ts`. */
export interface CandidateCardsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  provider: string;
  /** CHECK: <> '' */
  name: string;
  normName: Generated<string>;
  /** Ordered card types; empty when the source didn't provide one. */
  types: Generated<string[]>;
  superTypes: Generated<string[]>;
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
  tags: Generated<string[]>;
  /** CHECK: <> '' */
  shortCode: string | null;
  /** CHECK: <> '' */
  externalId: string;
  /** CHECK: <> '{}' AND <> 'null'::jsonb */
  extraData: unknown | null;
  /** User who submitted this candidate in-app; NULL for other providers. FK users(id) ON DELETE SET NULL. */
  submittedByUserId: string | null;
  /** Contributor's free-text "where I spotted this" note. CHECK: <> '' */
  submissionNote: string | null;
  checkedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** CHECK constraints are Zod-validated by candidatePrintingFieldRules in `schemas.ts`. */
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
  isOvernumbered: boolean | null;
  markerSlugs: Generated<string[]>;
  /** Distribution channel slugs (events/products) applied to the accepted printing. */
  distributionChannelSlugs: Generated<string[]>;
  /** CHECK: <> '' */
  finish: string | null;
  /** FK → card_sizes(slug) on accept; NULL defaults to 'standard'. CHECK: <> '' */
  size: string | null;
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

  /** CHECK: <> '' */
  language: string | null;
  /** CHECK: <> '' */
  printedName: string | null;
  /** Year stamped on the physical card; differs from set release for reprints. */
  printedYear: number | null;

  checkedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

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

/** What a contributor sent: a whole new card, a field correction, or an image. */
export type CardSubmissionKind = "new_card" | "correction" | "image";

/**
 * Where a submission ended up. `already_correct` means the catalog already
 * matched everything proposed, which is a distinct outcome from an admin
 * declining it (`not_applied`) or rejecting it as junk (`rejected`).
 */
export type CardSubmissionStatus =
  | "pending"
  | "accepted"
  | "already_correct"
  | "not_applied"
  | "rejected";

/** Canned resolution reason; drives the sentence the contributor is shown. */
export type CardSubmissionReason =
  | "duplicate"
  | "already_correct"
  | "unverified"
  | "not_a_card"
  | "bad_image";

/**
 * Durable outcome record for in-app submissions. Deliberately not columns on
 * `candidate_cards`: that table is staging and gets hard-deleted per provider,
 * while a contributor's history has to outlive a cleanup.
 */
export interface CardSubmissionsTable {
  id: Generated<string>;
  /** FK users(id) ON DELETE CASCADE. */
  userId: string;
  /** Mirrors the candidate's natural key. CHECK: <> '' */
  provider: string;
  /** CHECK: <> '' */
  externalId: string;
  /** FK candidate_cards(id) ON DELETE SET NULL — outlives the staging row. */
  candidateCardId: string | null;
  kind: CardSubmissionKind;
  /** Snapshot of the submitted name. CHECK: <> '' */
  cardName: string;
  /** Target card slug for corrections and images. CHECK: <> '' */
  cardSlug: string | null;
  /** Snapshot of `candidate_cards.submission_note`. CHECK: <> '' */
  note: string | null;
  /**
   * Field names that differed from the live card when this was submitted.
   * Resolution asks how many of these the catalog now agrees with, so an admin
   * accepting the same value from another provider's column still credits the
   * contributor. jsonb, typed as the parsed array on both sides and guarded by
   * a `jsonb_typeof(proposed_diff) = 'array'` CHECK.
   */
  proposedDiff: ColumnType<string[], string[] | undefined, string[]>;
  status: ColumnType<CardSubmissionStatus, CardSubmissionStatus | undefined, CardSubmissionStatus>;
  resolutionReason: CardSubmissionReason | null;
  /** Free-text message shown to the contributor. CHECK: <> '' */
  resolutionNote: string | null;
  /** CHECK: set exactly when status <> 'pending'. */
  resolvedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  resolvedByUserId: string | null;
  /** The card the submission ended up in, once accepted. */
  acceptedCardId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface PrintingLinkOverridesTable {
  /** CHECK: <> '' */
  externalId: string;
  finish: string;
  /**
   * Source provider the pin is scoped to; '' is the legacy
   * wildcard that matches candidates from any provider. Resolution prefers a
   * provider-scoped row over the wildcard.
   */
  provider: string;
  /** FK: printings(id) ON DELETE CASCADE */
  printingId: string;
  createdAt: CreatedAt;
}

/**
 * Deduplicated image storage. Multiple printing_images rows can reference the
 * same image_files row, avoiding duplicate files on disk.
 */
// Must stay exported — TypeScript names it in inferred Kysely query return
// types (e.g. selectCopyWithCard in repositories/query-helpers.ts).
// oxlint-disable-next-line jsdoc/check-tag-names -- @public is consumed by knip to suppress the unused-export warning
/** @public */
export interface ImageFilesTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  originalUrl: string | null;
  /** CHECK: <> '' */
  rehostedUrl: string | null;
  /** CHECK: IN (0, 90, 180, 270) */
  rotation: Generated<0 | 90 | 180 | 270>;
  /**
   * When true, the rehost pipeline trims white scanner margins and 1px shave
   * before generating WebP variants. Default false (digital images, no trim).
   * The `-orig` file is always preserved unmodified regardless of this flag.
   */
  needsTrim: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** CHECK: face IN ('front', 'back') — enforced by the `CardFace` type. */
export interface PrintingImagesTable {
  id: Generated<string>;
  printingId: string;
  face: Generated<CardFace>;
  /** FK: image_files(id) */
  imageFileId: string;
  isActive: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CardNameAliasesTable {
  normName: string;
  /** FK: ON DELETE CASCADE */
  cardId: string;
}

interface LanguagesTable {
  code: string;
  name: string;
  /** Hex color for the language chip (CHECK: ^#[0-9a-fA-F]{6}$). */
  color: string | null;
  sortOrder: Generated<number>;
  /**
   * Listed in `WellKnown.language`; a trigger blocks rename/delete.
   * `Generated` because admin-created languages are never well-known and the
   * repo's insert omits it, leaning on the column's `DEFAULT false`.
   */
  isWellKnown: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

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

interface PrintingMarkersTable {
  /** PK part 1 — FK ON DELETE CASCADE */
  printingId: string;
  /** PK part 2 — FK ON DELETE RESTRICT */
  markerId: string;
}

/**
 * Admin-curated category vocabulary for {@link CustomTagsTable}. Categories
 * namespace tags so each custom deck-builder format (e.g. region-locked
 * freeform) only sees its own set.
 */
interface CustomTagCategoriesTable {
  id: Generated<string>;
  /** CHECK: <> '' — e.g. "region" */
  slug: string;
  /** CHECK: <> '' */
  label: string;
  /** CHECK: <> '' */
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Admin-curated supplemental tags on cards. Used by custom deck-builder
 * formats that filter by tag (first: region-locked freeform decks).
 */
interface CustomTagsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  slug: string;
  /** CHECK: <> '' */
  label: string;
  /** FK → custom_tag_categories.id, ON DELETE RESTRICT */
  categoryId: string;
  /** CHECK: <> '' */
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface CardCustomTagsTable {
  /** PK part 1 — FK ON DELETE CASCADE */
  cardId: string;
  /** PK part 2 — FK ON DELETE CASCADE */
  customTagId: string;
}

/**
 * Admin-managed categories for the printed card tags (`cards.tags`):
 * region, champion, species, … Groups tag options into sections in the
 * card-browser filter panel. Distinct from {@link CustomTagCategoriesTable},
 * which namespaces the admin-curated per-card custom tags.
 */
interface TagCategoriesTable {
  id: Generated<string>;
  /** CHECK: <> '' — e.g. "region" */
  slug: string;
  /** CHECK: <> '' */
  label: string;
  /** CHECK: <> '' */
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Classification of one printed tag into a category. `tag` is the exact
 * string as it appears in `cards.tags` (display casing, apostrophes,
 * spaces). A tag with no row here is unclassified and shows under
 * "Other tags" in the filter UI.
 */
interface TagDefinitionsTable {
  id: Generated<string>;
  /** UNIQUE, CHECK: <> '' AND tag = btrim(tag) */
  tag: string;
  /** FK → tag_categories.id, ON DELETE RESTRICT */
  categoryId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Fixed-content Riot products. Catalog data, not user
 * data: contents are written only by snapshotting a list server-side, and
 * nothing here touches collections or decks.
 */
export interface ProductsTable {
  id: Generated<string>;
  /** UNIQUE, CHECK: ~ '^[a-z0-9][a-z0-9-]{2,79}$' — mutable, used in URLs */
  slug: string;
  /** CHECK: length 1..120 */
  name: string;
  /** Markdown. CHECK: NULL or length <= 2000 */
  description: string | null;
  /** FK → sets.id, ON DELETE SET NULL — the wave the product released with */
  setId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** Product contents at printing granularity. Composite PK (productId, printingId). */
interface ProductPrintingsTable {
  /** PK part 1 — FK → products.id, ON DELETE CASCADE */
  productId: string;
  /** PK part 2 — FK → printings.id, NO cascade (printing undeletable while referenced) */
  printingId: string;
  /** CHECK: > 0 */
  quantity: number;
}

/**
 * Where a printing was distributed: tournament events, retail products,
 * starter decks, etc. Many-to-many with printings via `printing_distribution_channels`.
 * Not identity-bearing — two printings can share visuals but differ in distribution.
 */
interface DistributionChannelsTable {
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

interface PrintingDistributionChannelsTable {
  /** PK part 1 — FK ON DELETE CASCADE */
  printingId: string;
  /** PK part 2 — FK ON DELETE RESTRICT */
  channelId: string;
  /** CHECK: <> '' — e.g. "Top 8 reward at Worlds 2025" */
  distributionNote: string | null;
}

/**
 * Where a promo printing's claims come from. Named "citations"
 * rather than "sources" because a *printing source* already means a provider's
 * candidate row everywhere else in this codebase.
 */
interface PrintingCitationsTable {
  id: Generated<string>;
  /** FK ON DELETE CASCADE */
  printingId: string;
  /** CHECK: 1..120 — e.g. "Launch party unboxing (RiftboundDaily)" */
  label: string;
  /** CHECK: 1..2000. NULL for a citation with no permalink. */
  sourceUrl: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
}

interface ProviderSettingsTable {
  /** PK — matches candidate_cards.provider */
  provider: string;
  sortOrder: Generated<number>;
  isHidden: Generated<boolean>;
  isFavorite: Generated<boolean>;
  /** Whether card-review grant holders may review this provider's candidates. */
  helperReviewable: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface KeywordsTable {
  /** PK — canonical keyword name */
  name: string;
  /** CHECK: matches ^#[0-9a-fA-F]{6}$ */
  color: string;
  darkText: Generated<boolean>;
  isWellKnown: Generated<boolean>;
  /** Glyph cost renders inside the keyword bracket, e.g. `[Equip :rb_energy_1:]`. */
  costKeyword: ColumnType<boolean, boolean | undefined, boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface KeywordTranslationsTable {
  /** FK → keywords(name) ON UPDATE CASCADE */
  keywordName: string;
  /** FK → languages(code) ON UPDATE CASCADE */
  language: string;
  /** CHECK: <> '' */
  label: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface FeatureFlagsTable {
  key: string;
  enabled: Generated<boolean>;
  description: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface UserFeatureFlagsTable {
  userId: string;
  flagKey: string;
  enabled: boolean;
}

export interface SiteSettingsTable {
  /** CHECK: <> '' */
  key: string;
  value: string;
  /** CHECK: IN ('web', 'api'). Defaults to 'web'. */
  scope: Generated<"web" | "api">;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface UserPreferencesTable {
  userId: string;
  data: ColumnType<
    UserPreferencesResponse,
    UserPreferencesResponse | undefined,
    UserPreferencesResponse
  >;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface FormatsTable {
  /** CHECK: <> '' */
  id: string;
  /** CHECK: <> '' */
  name: string;
  createdAt: CreatedAt;
}

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

interface RuleVersionsTable {
  /** CHECK: IN ('core', 'tournament') */
  kind: RuleKind;
  version: string;
  comments: string | null;
  importedAt: ColumnType<Date, Date | undefined, Date>;
}

interface RulesTable {
  id: Generated<string>;
  /** CHECK: IN ('core', 'tournament') */
  kind: RuleKind;
  version: string;
  /** CHECK: <> '' */
  ruleNumber: string;
  sortOrder: number;
  /** CHECK: 0–3 */
  depth: number;
  /** CHECK: IN ('title', 'subtitle', 'text') */
  ruleType: RuleType;
  content: string;
  /** CHECK: IN ('added', 'modified', 'removed'). Defaults to 'added'. */
  changeType: Generated<RuleChangeType>;
  createdAt: CreatedAt;
}

export interface ReferenceTable {
  slug: string;
  label: string;
  sortOrder: number;
  /**
   * Listed in the matching `WellKnown` group; a trigger blocks rename/delete.
   * `Generated` because admin-created rows are never well-known and the repos
   * omit the column, leaning on its `DEFAULT false`.
   */
  isWellKnown: Generated<boolean>;
}

type CardTypesTable = ReferenceTable;
export interface RaritiesTable extends ReferenceTable {
  color: string | null;
}
export interface DomainsTable extends ReferenceTable {
  color: string | null;
}
type SuperTypesTable = ReferenceTable;
type FinishesTable = ReferenceTable;
type ArtVariantsTable = ReferenceTable;
type CardSizesTable = ReferenceTable;
type DeckFormatsTable = ReferenceTable;
type DeckZonesTable = ReferenceTable;
type ConditionsTable = ReferenceTable;
type GradersTable = ReferenceTable;

interface PrintingEventsTable {
  id: Generated<string>;
  printingId: string;
  status: Generated<"pending" | "sent" | "failed">;
  retryCount: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface JobRunsTable {
  id: Generated<string>;
  kind: string;
  trigger: JobTrigger;
  status: JobStatus;
  startedAt: ColumnType<Date, Date | undefined, Date>;
  finishedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  durationMs: ColumnType<number | null, number | null | undefined, number | null>;
  errorMessage: ColumnType<string | null, string | null | undefined, string | null>;
  result: ColumnType<unknown, unknown | undefined, unknown>;
  /** Activity axis: true = succeeded but found no work, false = did work, null
   *  = unclassified (failed runs, jobs without a classifier, rows predating the column). */
  noop: ColumnType<boolean | null, boolean | null | undefined, boolean | null>;
}

interface JobSchedulesTable {
  kind: string;
  /** Five-field cron expression, UTC. */
  schedule: string;
  updatedAt: UpdatedAt;
}

/**
 * Singleton metadata row (id = 1) for the scanner's embedding bank.
 *
 * The bank and labels are content-hashed files under `media/scan/` written by
 * the rebuild job; this row records the current generation for the public
 * manifest endpoint. `encoderTag` names the encoder file the bank was built
 * with — bank and browser encoder must always match. `watermark` is the
 * newest printing-image creation time included in the bank.
 */
interface ScanIndexTable {
  id: number;
  formatVersion: number;
  bankHash: string;
  entryCount: number;
  encoderTag: string;
  watermark: ColumnType<Date | null, Date | null | undefined, Date | null>;
  builtAt: ColumnType<Date, Date | undefined, Date>;
  durationMs: number;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface CardDomainsTable {
  cardId: string;
  domainSlug: string;
  ordinal: number;
}

interface CardSuperTypesTable {
  cardId: string;
  superTypeSlug: string;
}

/** Ordered card-type junction. Position 0 mirrors `cards.type`. */
interface CardCardTypesTable {
  cardId: string;
  typeSlug: string;
  position: number;
}

/**
 * Where a `card_tokens` row came from. Mirrors `chk_card_tokens_source`
 *; exported as a value so the enum-CHECK parity test can
 * compare the two.
 */
export const CARD_TOKEN_SOURCES = ["derived", "manual"] as const;

/**
 * Token cards a card tells the player to create. Derived from
 * EN text; `manual` rows survive the recompute.
 */
interface CardTokensTable {
  cardId: string;
  tokenCardId: string;
  /** Defaults to 'derived'. */
  source: Generated<(typeof CARD_TOKEN_SOURCES)[number]>;
}

interface MvLatestPrintingPricesView {
  printingId: string;
  marketplace: string;
  headlineCents: number;
  /** Day the price was last observed. A date, not a timestamp. */
  lastSeen: string;
}

/** Per-day headline price per printing. `day` is a date. */
interface MvDailyPrintingPricesView {
  printingId: string;
  marketplace: string;
  day: string;
  headlineCents: number;
}

// Must stay exported — TypeScript names it in inferred Kysely query return
// types (e.g. selectCopyWithCard in repositories/query-helpers.ts).
// oxlint-disable-next-line jsdoc/check-tag-names -- @public is consumed by knip to suppress the unused-export warning
/** @public */
export interface MvCardAggregatesView {
  cardId: string;
  domains: string[];
  superTypes: string[];
  types: string[];
  /** Token card ids, ordered by token name. */
  tokenCardIds: string[];
}

/** Every column of `printings` plus the two precomputed catalog derivations. */
type PrintingsOrderedView = PrintingsTable & { canonicalRank: number; hasFoilTwin: boolean };

// oxlint-disable-next-line jsdoc/check-tag-names -- @public is consumed by knip to suppress the unused-export warning
/** @public */
export interface MvPrintingFoilTwinsView {
  printingId: string;
}

export interface Database {
  sets: SetsTable;
  setReleases: SetReleasesTable;
  cards: CardsTable;
  cardErrata: CardErrataTable;
  printings: PrintingsTable;

  marketplaceGroups: MarketplaceGroupsTable;
  marketplaceProducts: MarketplaceProductsTable;
  marketplaceProductVariants: MarketplaceProductVariantsTable;
  marketplaceProductPrices: MarketplaceProductPricesTable;
  marketplaceIgnoredProducts: MarketplaceIgnoredProductsTable;
  marketplaceIgnoredVariants: MarketplaceIgnoredVariantsTable;
  marketplaceProductCardOverrides: MarketplaceProductCardOverridesTable;

  admins: AdminsTable;
  adminGrants: AdminGrantsTable;

  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;
  apiKeys: ApiKeysTable;

  collections: CollectionsTable;
  copies: CopiesTable;
  collectionDeckbuildingPrefs: CollectionDeckbuildingPrefsTable;
  collectionSidebarPrefs: CollectionSidebarPrefsTable;
  collectionEvents: CollectionEventsTable;

  adminEvents: AdminEventsTable;
  decks: DecksTable;
  deckCards: DeckCardsTable;
  deckPlans: DeckPlansTable;
  deckMatchupPlans: DeckMatchupPlansTable;
  deckMatchupSwaps: DeckMatchupSwapsTable;

  deckFolders: DeckFoldersTable;
  deckFolderEntries: DeckFolderEntriesTable;

  uvsgamesEvents: UvsgamesEventsTable;
  uvsgamesEventTemplates: UvsgamesEventTemplatesTable;
  uvsgamesFormatMappings: UvsgamesFormatMappingsTable;
  uvsgamesStores: UvsgamesStoresTable;
  uvsgamesPlayers: UvsgamesPlayersTable;
  uvsgamesIdProbes: UvsgamesIdProbesTable;
  uvsgamesEventChecks: UvsgamesEventChecksTable;
  uvsgamesEventStandings: UvsgamesEventStandingsTable;
  uvsgamesEventPhases: UvsgamesEventPhasesTable;
  uvsgamesEventMatches: UvsgamesEventMatchesTable;
  uvsgamesDecklists: UvsgamesDecklistsTable;
  uvsgamesDecklistCards: UvsgamesDecklistCardsTable;
  playloltcgShops: PlayloltcgShopsTable;
  playloltcgEvents: PlayloltcgEventsTable;
  playloltcgEventChecks: PlayloltcgEventChecksTable;
  playloltcgEventStandings: PlayloltcgEventStandingsTable;
  playloltcgDecklists: PlayloltcgDecklistsTable;
  playloltcgDecklistCards: PlayloltcgDecklistCardsTable;
  metaSyncSettings: MetaSyncSettingsTable;
  metaEvents: MetaEventsTable;
  metaEventPlayers: MetaEventPlayersTable;
  metaEventMatches: MetaEventMatchesTable;
  metaEventPhases: MetaEventPhasesTable;
  metaEventOverlays: MetaEventOverlaysTable;
  metaEventPlayerOverlays: MetaEventPlayerOverlaysTable;
  metaEventPlayerOverlayCards: MetaEventPlayerOverlayCardsTable;
  ignoredMetaSourceEvents: IgnoredMetaSourceEventsTable;
  ignoredMetaSourcePlayers: IgnoredMetaSourcePlayersTable;
  metaEventSources: MetaEventSourcesTable;
  metaCredits: MetaCreditsTable;
  metaSubmissions: MetaSubmissionsTable;

  tierLists: TierListsTable;

  overlayChannels: OverlayChannelsTable;

  stagePresets: StagePresetsTable;

  lists: ListsTable;
  listEntries: ListEntriesTable;

  friendGroups: FriendGroupsTable;
  friendGroupMembers: FriendGroupMembersTable;
  friendGroupInvites: FriendGroupInvitesTable;
  friendGroupDiscordLinks: FriendGroupDiscordLinksTable;
  friendGroupListShares: FriendGroupListSharesTable;
  friendGroupCollectionShares: FriendGroupCollectionSharesTable;

  userContactMethods: UserContactMethodsTable;
  friendGroupMemberContacts: FriendGroupMemberContactsTable;

  organizations: OrganizationsTable;
  organizationMembers: OrganizationMembersTable;

  tournaments: TournamentsTable;
  tournamentStaff: TournamentStaffTable;
  tournamentParticipants: TournamentParticipantsTable;
  tournamentTeams: TournamentTeamsTable;
  podRounds: PodRoundsTable;
  pods: PodsTable;
  podMembers: PodMembersTable;
  podByes: PodByesTable;

  cardTrades: CardTradesTable;
  cardTradeCopies: CardTradeCopiesTable;

  loans: LoansTable;
  loanCopies: LoanCopiesTable;

  deckCheckEntries: DeckCheckEntriesTable;
  deckCheckEntryCards: DeckCheckEntryCardsTable;
  deckCheckKeys: DeckCheckKeysTable;

  candidateCards: CandidateCardsTable;
  candidatePrintings: CandidatePrintingsTable;
  cardNameAliases: CardNameAliasesTable;

  ignoredCandidateCards: IgnoredCandidateCardsTable;
  ignoredCandidatePrintings: IgnoredCandidatePrintingsTable;

  cardSubmissions: CardSubmissionsTable;

  printingLinkOverrides: PrintingLinkOverridesTable;

  imageFiles: ImageFilesTable;
  printingImages: PrintingImagesTable;

  languages: LanguagesTable;

  markers: MarkersTable;
  printingMarkers: PrintingMarkersTable;
  distributionChannels: DistributionChannelsTable;
  printingDistributionChannels: PrintingDistributionChannelsTable;

  printingCitations: PrintingCitationsTable;

  customTagCategories: CustomTagCategoriesTable;
  customTags: CustomTagsTable;
  cardCustomTags: CardCustomTagsTable;

  tagCategories: TagCategoriesTable;
  tagDefinitions: TagDefinitionsTable;

  products: ProductsTable;
  productPrintings: ProductPrintingsTable;

  providerSettings: ProviderSettingsTable;

  featureFlags: FeatureFlagsTable;

  userFeatureFlags: UserFeatureFlagsTable;

  keywords: KeywordsTable;

  keywordTranslations: KeywordTranslationsTable;

  siteSettings: SiteSettingsTable;

  userPreferences: UserPreferencesTable;

  formats: FormatsTable;

  cardBans: CardBansTable;

  ruleVersions: RuleVersionsTable;
  rules: RulesTable;

  cardTypes: CardTypesTable;
  rarities: RaritiesTable;
  domains: DomainsTable;
  superTypes: SuperTypesTable;
  finishes: FinishesTable;
  artVariants: ArtVariantsTable;
  cardSizes: CardSizesTable;
  deckFormats: DeckFormatsTable;
  deckZones: DeckZonesTable;
  conditions: ConditionsTable;
  graders: GradersTable;

  cardDomains: CardDomainsTable;
  cardSuperTypes: CardSuperTypesTable;
  cardCardTypes: CardCardTypesTable;
  cardTokens: CardTokensTable;

  printingEvents: PrintingEventsTable;

  jobRuns: JobRunsTable;
  jobSchedules: JobSchedulesTable;

  scanIndex: ScanIndexTable;

  mvLatestPrintingPrices: MvLatestPrintingPricesView;
  mvDailyPrintingPrices: MvDailyPrintingPricesView;
  mvCardAggregates: MvCardAggregatesView;
  mvPrintingFoilTwins: MvPrintingFoilTwinsView;

  printingsOrdered: PrintingsOrderedView;
}
