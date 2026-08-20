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
  MetaListStatus,
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
  sortOrder: Generated<number>;
  setType: Generated<"main" | "supplemental">;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** How wide a period a `set_releases.released_at` date stands for. */
type ReleasePrecision = "day" | "month" | "quarter" | "year";

/**
 * When a set reached a given language (migration 233). One row per
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
  /** FK → card_types(slug). Always the first entry of `card_card_types` (position 0); see ADR-037. */
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

/** @see cardErrataFieldRules in `@openrift/shared/db-field-rules` for Zod validation of CHECK constraints */
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
  isSigned: Generated<boolean>;
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
   * Substitute-art override for a printing with no scan of its own (migration
   * 257). CHECK: one of 'auto' | 'pinned' | 'none', and 'pinned' iff
   * `fallbackImageFileId` is set.
   */
  fallbackArtMode: Generated<FallbackArtMode>;
  /** FK → image_files(id) ON DELETE RESTRICT. Set exactly when the mode is 'pinned'. */
  fallbackImageFileId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Unified marketplace pricing (migration 022) ────────────────────────────

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

/** Level 2: one row per upstream marketplace listing (e.g. one TCGplayer product). */
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

// ─── Admin (migration 012) ────────────────────────────────────────────────

interface AdminsTable {
  userId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** Per-section admin grants (migration 196) — selective, non-full admin access. */
interface AdminGrantsTable {
  userId: string;
  section: string;
  createdAt: CreatedAt;
}

// ─── Auth (migration 003) ─────────────────────────────────────────────────

interface UsersTable {
  id: string;
  email: string;
  name: string | null;
  emailVerified: Generated<boolean>;
  image: string | null;
  shareToken: string | null;
  riotId: string | null;
  /**
   * DEFAULT 'hidden'. CHECK: one of 'hidden' / 'name' / 'riot_id' (migration
   * 255). Whether this user's meta-archive contributions are credited
   * publicly, and which field the credit reads. Consent cannot live on the
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
 * better-auth `@better-auth/api-key` plugin table (migration 200). Owned and
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

// ─── Collection tracking (migration 009) ────────────────────────────────────

/** @see collectionFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
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
 * Per-viewer sidebar visibility override for a collection (migration 223). A
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

// ─── Admin audit events (migration 201) ──────────────────────────────────────

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
  | "meta-candidates.upload"
  | "meta-submission.resolve"
  | "meta-submission.reopen";

/** Entity vocabulary for {@link AdminEventsTable}. */
export type AdminEventEntityType =
  | "card"
  | "printing"
  | "candidate-card"
  | "candidate-printing"
  | "card-submission"
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

/** @see deckFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
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
   * Groups variants of one deck into a family (ADR-042). NULL for standalone
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

/** @see deckCardFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
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
 * Deck-level plan (ADR-029), 1:1 with a deck. All text fields default to ''
 * and are length-checked at the DB; battlefield FKs are nullable single cards
 * (one battlefield per scenario). @see updateDeckPlanSchema in `schemas.ts`.
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
 * User-authored folder for organising the deck list (migration 231). Flat, and
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
 * One stream overlay per user (migration 238): the token an OBS browser source
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
 * A named bundle of on-screen dressing for the creator tools (migration 242):
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
 * Creator-authored tier list (migration 237). The whole board lives in the
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

// ─── Meta archive (migration 235, ADR-014) ──────────────────────────────────

/**
 * One archived competitive event (migration 235). Admin-curated: there is no
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
  // No source key and no source URL: migration 255 moved both off the live
  // row. Attribution is {@link MetaEventSourcesTable}, and the link to a
  // provider is the candidate-side FK, which is many-to-one so several
  // sources can feed one event.
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * Satellite row pairing an archived `decks` row with its event and placement
 * (migration 235). The deck is the PK because a deck belongs to exactly one
 * event. Both FKs cascade, but neither reaches the `decks` row itself — the
 * admin delete-event path removes those explicitly.
 */
export interface MetaDecksTable {
  /** PK — FK → decks.id, ON DELETE CASCADE */
  deckId: string;
  /** FK → meta_events.id, ON DELETE CASCADE */
  metaEventId: string;
  /** CHECK: length 1..80 — free text, no players table */
  playerName: string;
  /** CHECK: >= 1. Lower is better; equal tiers within an event are ties. */
  finishTier: number;
  /** CHECK: NULL or length 1..20 — free text, e.g. "5-1" */
  record: string | null;
  /**
   * DEFAULT 'full'. CHECK: one of 'full' / 'partial' / 'archetype'. How much of
   * the pilot's list `deck_cards` holds — see {@link MetaListStatus} for what
   * each state means. All three count towards legend play-rate; 'archetype' is
   * the one excluded from card inclusion, and the one whose
   * `decks.share_token` stays NULL because it has no page. Promoting a deck out
   * of 'archetype' is what mints the token.
   */
  listStatus: Generated<MetaListStatus>;
  // No source key: migration 255 moved it off this row, because
  // `candidate_meta_decks.deck_id` is many-to-one and two providers can both
  // describe one archived deck. It lives in {@link MetaDeckSourcesTable}
  // (migration 256), not on the candidate, which an ignore deletes.
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Meta archive candidates (migration 236, ADR-014) ───────────────────────

/**
 * A proposed event, pushed by external tooling and awaiting an admin's accept
 * (migration 236). `(provider, external_id)` is UNIQUE — the source's own key,
 * which is what makes an upload idempotent and per-event replacing.
 *
 * `format` carries whatever the source called it and has no FK: an unknown
 * format is something the review screen reports, not a reason to reject an
 * upload.
 */
export interface CandidateMetaEventsTable {
  id: Generated<string>;
  /** CHECK: <> '' — implicit vocabulary, a new string is a new provider */
  provider: string;
  /** CHECK: <> '' — the source's stable id for this event */
  externalId: string;
  /** CHECK: length 1..120 */
  name: string;
  /** `date` column, handed back as `"2026-08-14"` (OID 1082 override in `db/connect.ts`). */
  eventDate: string;
  /** CHECK: <> '' — no FK to deck_formats, unlike the live column */
  format: string;
  /** CHECK: NULL or > 0 */
  playerCount: number | null;
  /** CHECK: NULL or length 1..120 */
  organizer: string | null;
  /** CHECK: NULL or length 1..2000 */
  sourceUrl: string | null;
  /** CHECK: NULL or length <= 4000 */
  notes: string | null;
  /** FK → meta_events.id ON DELETE SET NULL — the live row this was accepted into. */
  metaEventId: string | null;
  /** When an admin last reviewed this row. Reset to NULL whenever an upload changes it. */
  checkedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  /** Source fields that map to no column of ours. */
  extraData: unknown | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** One card row inside {@link CandidateMetaDecksTable.cards}. */
export interface CandidateMetaDeckCard {
  /** The name exactly as the source wrote it — kept even when it resolves. */
  name: string;
  /** A `WellKnown.deckZone` value. */
  zone: string;
  quantity: number;
  /** The shared name matcher's verdict; null while the name resolves to nothing. */
  cardId: string | null;
}

/**
 * A proposed deck under a candidate event (migration 236). Card lists are jsonb
 * rather than a third staging table: they are written whole, read whole, and
 * never queried across rows.
 *
 * `(candidate_event_id, external_id)` is UNIQUE. Deck external ids are scoped
 * to their event, which is why the ignore list keys on the source's event id
 * alongside the deck's rather than on the provider alone.
 */
export interface CandidateMetaDecksTable {
  id: Generated<string>;
  /**
   * FK → candidate_meta_events.id ON DELETE CASCADE. NULL for a user
   * submission, which targets a live event directly through
   * {@link metaEventId} rather than inventing a placeholder candidate event.
   * CHECK: exactly one of the two is set (migration 255).
   */
  candidateEventId: string | null;
  /** FK → meta_events.id ON DELETE CASCADE. See {@link candidateEventId}. */
  metaEventId: string | null;
  /** CHECK: <> '' */
  externalId: string;
  /** CHECK: length 1..80 */
  playerName: string;
  /** CHECK: >= 1 */
  finishTier: number;
  /** CHECK: NULL or length 1..20 */
  record: string | null;
  /** CHECK: NULL or length 1..120 — accept derives one when the source gave none. */
  name: string | null;
  /** jsonb array of the source's card lines. */
  cards: CandidateMetaDeckCard[];
  /**
   * DEFAULT 'full'. Same CHECK and same vocabulary as
   * {@link MetaDecksTable.listStatus}, which accepting copies it into. It is
   * the source's own claim about its payload, never inferred from the card
   * count.
   */
  listStatus: Generated<MetaListStatus>;
  /** FK → decks.id ON DELETE SET NULL — the live archived deck this became. */
  deckId: string | null;
  /**
   * FK → users.id ON DELETE SET NULL (migration 255). Set for the
   * `usersubmission` provider only; scraped providers leave it NULL. Copied
   * from `candidate_cards`, and admin-facing: nothing public reads it.
   */
  submittedByUserId: string | null;
  /** What the submitter wrote about their submission. CHECK: <> ''. */
  submissionNote: string | null;
  checkedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/**
 * A candidate event the admin rejected (migration 236). Skipped at ingest, so
 * the same key never re-enters the queue. The source key is the identity —
 * there is no surrogate id.
 */
interface IgnoredCandidateMetaEventsTable {
  /** PK part. CHECK: <> '' */
  provider: string;
  /** PK part. CHECK: <> '' */
  externalId: string;
  createdAt: CreatedAt;
}

/**
 * A rejected candidate deck (migration 236). Keyed on the source's event id as
 * well as the deck's, because deck external ids are only unique within their
 * event. @see IgnoredCandidateMetaEventsTable
 */
interface IgnoredCandidateMetaDecksTable {
  /** PK part. CHECK: <> '' */
  provider: string;
  /** PK part. The source's id for the deck's event. CHECK: <> '' */
  eventExternalId: string;
  /** PK part. CHECK: <> '' */
  externalId: string;
  createdAt: CreatedAt;
}

// ─── Meta archive multi-source (migration 255, ADR-014) ─────────────────────

/**
 * Where an event's data came from, one row per source (migration 255). This is
 * a citation, public and printed on the event page. It never carries a user: a
 * contributor is credited through {@link MetaCreditsTable} instead.
 *
 * A provider row is written when that provider's candidate is linked and
 * removed when it is unlinked, so linking a source credits it even when the
 * admin took none of its field values. A hand-entered row leaves the key NULL,
 * for an admin transcribing from a VOD or a photo of the standings board.
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
  createdAt: CreatedAt;
}

/**
 * Which source deck an archived deck came from, one row per source
 * (migration 256). Not a citation and nothing public reads it — a deck prints
 * no attribution of its own, its event's {@link MetaEventSourcesTable} list
 * covers that. It exists so the source key outlives the candidate row: ignoring
 * a deck deletes the candidate, and without this the next upload would archive
 * a second copy of the same list instead of finding the deck it already made.
 *
 * Written for provider ingest only. A user submission targets a live event
 * directly and has no source event to key on, which is the same reason it
 * cannot be ignored.
 */
interface MetaDeckSourcesTable {
  id: Generated<string>;
  /** FK → decks.id ON DELETE CASCADE */
  deckId: string;
  /** CHECK: <> '' */
  provider: string;
  /** The provider's own id for the deck's event. CHECK: <> ''. */
  eventExternalId: string;
  /** The provider's own id for the deck, unique only within its event. CHECK: <> ''. */
  externalId: string;
  createdAt: CreatedAt;
}

/**
 * One contribution by a signed-in user, written in the same transaction as the
 * accept it belongs to (migration 255). Never written for provider ingest or
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
  /** FK → decks.id ON DELETE CASCADE. NULL credits the event itself. */
  deckId: string | null;
  /** FK → users.id ON DELETE CASCADE — deleting an account removes its credits. */
  userId: string;
  createdAt: CreatedAt;
}

/**
 * The outcome ledger for user decklist submissions (migration 255), shaped
 * like `card_submissions` (ADR-036). Provider uploads get none: those sources
 * are the maintainer's own tooling, and staging's presence semantics suffice.
 *
 * Every FK out of this row is ON DELETE SET NULL except the submitter's, so
 * the ledger keeps reading correctly after the candidate is accepted, the
 * target event is deleted, or the deck is removed.
 */
export interface MetaDeckSubmissionsTable {
  id: Generated<string>;
  /** FK → users.id ON DELETE CASCADE */
  userId: string;
  /** CHECK: <> '' — `usersubmission` today, matching the candidate's provider. */
  provider: string;
  /** CHECK: <> '' — per-submission id, UNIQUE with {@link provider}. */
  externalId: string;
  /** FK → candidate_meta_decks.id ON DELETE SET NULL */
  candidateMetaDeckId: string | null;
  /** FK → meta_events.id ON DELETE SET NULL — the event this targets, when it has one. */
  metaEventId: string | null;
  /** What the submitter called the event, so the row still reads without a target. CHECK: length 1..120. */
  eventName: string;
  /** CHECK: length 1..80 */
  playerName: string;
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
 * Unified list table — replaces the old trade_lists and wish_lists.
 *
 * `intent` is the surface (wish / trade / organize). `kind` is the granularity
 * the list tracks: a list contains uniformly cards, printings, or copies.
 * The intent × kind matrix is constrained (migration 133, renamed in 135):
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
  /** ADR-017: list-level default for entries that don't override. */
  defaultPricePref: TradePricePref | null;
  /** Set iff defaultPricePref === 'absolute'. Positive integer. */
  defaultPriceAbsoluteCents: number | null;
  defaultTradeType: TradeType | null;
  /** Required for any 'absolute' default or override; ignored otherwise. */
  currency: Currency | null;
  sortOrder: Generated<number>;
  /**
   * Migration 223: pushes the list behind the sidebar's "Show more" toggle. A
   * plain column (not a per-viewer table like collections use) because a list
   * has exactly one viewer, its owner.
   */
  sidebarHidden: Generated<boolean>;
  /**
   * ADR-034 dynamic rules (jsonb array). Typed as the parsed shape on both
   * sides — the repo passes the array straight through and postgres.js does the
   * serializing, guarded by a `jsonb_typeof(rules) = 'array'` CHECK. NOT NULL
   * with a `'[]'` default, so insert may omit it. Empty array = manual-only list.
   */
  rules: ColumnType<ListRules, ListRules | undefined, ListRules>;
  /**
   * How several rules combine (ADR-034 amendment 2, migration 190). NULL = the
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
  /** ADR-017: per-entry override. NULL = inherit parent list default. */
  pricePref: TradePricePref | null;
  /** Set iff pricePref === 'absolute'. */
  priceAbsoluteCents: number | null;
  tradeType: TradeType | null;
}

// ─── Friend groups (migration 134, ADR-013) ──────────────────────────────────

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

/** Account-level contact channels a user can reveal per group (migration 162). */
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

/** Which of a member's contact methods are revealed to a given group (migration 162). */
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
 * A Discord server linked to a friend group (migration 217). Pending rows
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
  /** Channels of the linked guild the bot scans for card names (migration 222). */
  tradeChannelIds: Generated<string[]>;
}

// ─── Organizations (migration 166, ADR-033) ──────────────────────────────────
// A first-class tournament host alongside users (a local game store, a league).
// Admin-provisioned. `organization_members` carries org-level authority; both
// `owner` and `manager` are implicit organizers on every tournament the org hosts.
// Ownership is the `role = 'owner'` membership rows alone (migration 254); a
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
   * (migration 249) keeps a member of the org — the pointer is constrained to a
   * membership row, not to one carrying the owner role.
   */
  role: OrganizationRole;
  joinedAt: CreatedAt;
}

// ─── Tournaments umbrella (migration 145 as pod_tournaments, renamed 167) ─────
// ADR-033: one entity composing any subset of {pairing engine, deck submission,
// deck check, judges} under a user or organization host, optionally linked to a
// friend group. The pairing module keeps ADR-022's lean derive-on-read model:
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

  // Tokens (distinct capabilities).
  /** Pod follow-along + result entry (ADR-022). Unique where not null. */
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

// A fixed 2v2 team (migration 212). Identity only: membership rides on
// tournament_participants.team_id, and the display name derives from the two
// member names. Deleting the row dissolves the team (members SET NULL).
// Not exported: only the Database interface references it.
interface TournamentTeamsTable {
  id: Generated<string>;
  tournamentId: string;
  createdAt: CreatedAt;
}

// Unified participant (ADR-033): walk-in name → invited/claimable email →
// linked account. Replaces pod_players and the identity half of
// deck_check_entries. Pairing reads only id/status; the identity + claim columns
// are dormant for a plain pod tournament.
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
  /** Claim machinery, lifted from deck_check_entries. */
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

// Byes (migration 147). A row records that a player sat a round out; the score
// it is worth is the tournament's bye_points (derived on read — no points
// column). Manual only. Not exported for the same reason as PodMembersTable: no
// module derives a Selectable<> from it.
interface PodByesTable {
  roundId: string;
  playerId: string;
}

// ─── Deck check (migration 149, ADR-025; re-parented to the tournaments
// umbrella in migration 169/170, ADR-033) ────────────────────────────────────
// The event is gone — a deck-check tournament is `tournaments` that collects
// decklists (deck_submission <> 'none'). Per-person identity + claim columns live
// on tournament_participants; the entry keeps the decklist + verification state
// and references its tournament + participant.

export interface DeckCheckEntriesTable {
  id: Generated<string>;
  /** Owning tournament (was event_id; reuses the migrated event's uuid). */
  tournamentId: string;
  /** The participant this decklist belongs to; CASCADE — removing the participant deletes this entry (migration 174). */
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
  /** Lifecycle state (ADR-027); the player edits only in 'editable'. */
  state: Generated<DeckCheckEntryState>;
  /** How the most recent judge review went; null until a judge reviewed. */
  reviewOutcome: DeckCheckReviewOutcome | null;
  checkedBy: string | null;
  checkedAt: Date | null;
  /** Pre-event list approval (ADR-027), separate from the event-day check. */
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
  // Re-parented to the host (was group_id): exactly one of user / organization
  // (CHECK chk_deck_check_keys_host), so a host's keys span all its tournaments.
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

// ─── Card trades (migration 143, ADR-019) ────────────────────────────────────

export interface CardTradesTable {
  id: Generated<string>;
  /**
   * CHECK: exactly one of groupId / groupName is set. The id while the friend
   * group exists, the snapshotted name once it is deleted (migration 252), so a
   * finished trade keeps saying where it happened. Deleting a group cancels its
   * live trades, so a NULL here always means the trade is terminal.
   */
  groupId: string | null;
  /** CHECK: <> '' when set. Set only for a deleted group. */
  groupName: string | null;
  /**
   * Owns the copies (supply / tradelist side). Exactly one of giverUserId /
   * giverName is set: the id while the account exists, the snapshotted display
   * name once it is deleted (migration 248).
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
   * ADR-030 coalescing marker: when the recipient was emailed about this
   * request (instant or coalesced), or when it was suppressed (opted out).
   * NULL = still queued, awaiting the flush cron.
   */
  requestEmailSentAt: Date | null;
  /**
   * ADR-030 status-email marker: when the initiator was emailed that the trade
   * was accepted (reserved), or when it was suppressed. NULL while `status =
   * 'reserved'` = still queued for the trade-status flush.
   */
  reservedEmailSentAt: Date | null;
  /**
   * ADR-030 status-email marker: when the non-actor was emailed that the trade
   * was declined or cancelled, or when it was suppressed. NULL while `status IN
   * ('declined','cancelled')` = still queued for the trade-status flush.
   */
  closedEmailSentAt: Date | null;
}

interface CardTradeCopiesTable {
  tradeId: string;
  copyId: string;
}

// ─── Loans (migration 195, ADR-039) ──────────────────────────────────────────

export interface LoansTable {
  id: Generated<string>;
  /** Owns the copies; the loan is their personal ledger entry. */
  lenderUserId: string;
  /**
   * CHECK: exactly one of borrowerUserId / borrowerName is set. A member
   * borrower who deletes their account leaves the id NULL and their display
   * name snapshotted into borrowerName (migration 248), which is the same shape
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

// ─── Candidate cards (migration 018, renamed in 038) ─────────────────────────

/** @see candidateCardFieldRules in `schemas.ts` for Zod validation of CHECK constraints */
export interface CandidateCardsTable {
  id: Generated<string>;
  /** CHECK: <> '' */
  provider: string;
  /** CHECK: <> '' */
  name: string;
  normName: Generated<string>;
  /** Ordered card types (ADR-037); empty when the source didn't provide one. */
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
  /** ADR-036: user who submitted this candidate in-app; NULL for other providers. FK users(id) ON DELETE SET NULL. */
  submittedByUserId: string | null;
  /** ADR-036: contributor's free-text "where I spotted this" note. CHECK: <> '' */
  submissionNote: string | null;
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

// ─── Card submissions (migration 234, ADR-036) ───────────────────────────────

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
   * Source provider the pin is scoped to (migration 253); '' is the legacy
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

// ─── Languages (migration 054) ───────────────────────────────────────────────

interface LanguagesTable {
  code: string;
  name: string;
  /** Hex color for the language chip (CHECK: ^#[0-9a-fA-F]{6}$). Migration 203. */
  color: string | null;
  sortOrder: Generated<number>;
  /**
   * Listed in `WellKnown.language`; a trigger blocks rename/delete. Migration 205.
   * `Generated` because admin-created languages are never well-known and the
   * repo's insert omits it, leaning on the column's `DEFAULT false`.
   */
  isWellKnown: Generated<boolean>;
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

interface PrintingMarkersTable {
  /** PK part 1 — FK ON DELETE CASCADE */
  printingId: string;
  /** PK part 2 — FK ON DELETE RESTRICT */
  markerId: string;
}

// ─── Custom tags (migration 128, categories table added in 130) ──────────────

/**
 * Admin-curated category vocabulary for {@link CustomTagsTable}. Categories
 * namespace tags so each custom deck-builder format (e.g. region-locked
 * freeform) only sees its own set. Migrated from a freeform text column on
 * `custom_tags` in 130 so categories can be renamed and described in one
 * place.
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

// ─── Printed-tag classification (migration 202) ──────────────────────────────

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

// ─── Preconstructed products (migration 198, ADR-015) ────────────────────────

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

// ─── Distribution channels (migration 090, renamed from promo_types/034) ─────

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
 * Where a promo printing's claims come from (migration 258). Named "citations"
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

// ─── Provider settings (migration 035, renamed in 038) ───────────────────────

interface ProviderSettingsTable {
  /** PK — matches candidate_cards.provider */
  provider: string;
  sortOrder: Generated<number>;
  isHidden: Generated<boolean>;
  isFavorite: Generated<boolean>;
  /** Whether card-review grant holders may review this provider's candidates (migration 199). */
  helperReviewable: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Keywords (migration 043, renamed in 116) ────────────────────────────────

export interface KeywordsTable {
  /** PK — canonical keyword name */
  name: string;
  /** CHECK: matches ^#[0-9a-fA-F]{6}$ */
  color: string;
  darkText: Generated<boolean>;
  isWellKnown: Generated<boolean>;
  /** Glyph cost renders inside the keyword bracket, e.g. `[Equip :rb_energy_1:]` (migration 191). */
  costKeyword: ColumnType<boolean, boolean | undefined, boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Keyword translations (migration 071) ───────────────────────────────────

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

// ─── Feature flags (migration 014) ───────────────────────────────────────────

export interface FeatureFlagsTable {
  key: string;
  enabled: Generated<boolean>;
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
  /** CHECK: IN ('web', 'api'). Defaults to 'web'. */
  scope: Generated<"web" | "api">;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── User preferences (migration 047, consolidated in 050) ──────────────────

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

// ─── Formats (migration 054) ────────────────────────────────────────────────

interface FormatsTable {
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

// ─── Reference tables (migration 062) ────────────────────────────────────────

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
// Copy metadata reference tables (migration 194, ADR-038)
type ConditionsTable = ReferenceTable;
type GradersTable = ReferenceTable;

// ─── Printing events (migration 071) ────────────────────────────────────────

interface PrintingEventsTable {
  id: Generated<string>;
  printingId: string;
  status: Generated<"pending" | "sent" | "failed">;
  retryCount: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Job runs (migration 101) ────────────────────────────────────────────────

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
   *  = unclassified (failed runs, jobs without a classifier, pre-migration). */
  noop: ColumnType<boolean | null, boolean | null | undefined, boolean | null>;
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

// ─── Junction tables (migration 059) ─────────────────────────────────────────

interface CardDomainsTable {
  cardId: string;
  domainSlug: string;
  ordinal: number;
}

interface CardSuperTypesTable {
  cardId: string;
  superTypeSlug: string;
}

/** Ordered card-type junction (ADR-037). Position 0 mirrors `cards.type`. */
interface CardCardTypesTable {
  cardId: string;
  typeSlug: string;
  position: number;
}

/**
 * Where a `card_tokens` row came from. Mirrors `chk_card_tokens_source`
 * (migration 228); exported as a value so the enum-CHECK parity test can
 * compare the two.
 */
export const CARD_TOKEN_SOURCES = ["derived", "manual"] as const;

/**
 * Token cards a card tells the player to create (migration 228). Derived from
 * EN text; `manual` rows survive the recompute.
 */
interface CardTokensTable {
  cardId: string;
  tokenCardId: string;
  /** Defaults to 'derived'. */
  source: Generated<(typeof CARD_TOKEN_SOURCES)[number]>;
}

// ─── Materialized views (migration 085) ─────────────────────────────────────

interface MvLatestPrintingPricesView {
  printingId: string;
  marketplace: string;
  headlineCents: number;
  /** Day the price was last observed (migration 221). A date, not a timestamp. */
  lastSeen: string;
}

/** Per-day headline price per printing (migration 219). `day` is a date. */
interface MvDailyPrintingPricesView {
  printingId: string;
  marketplace: string;
  day: string;
  headlineCents: number;
}

interface MvCardAggregatesView {
  cardId: string;
  domains: string[];
  superTypes: string[];
  types: string[];
  /** Token card ids, ordered by token name (migration 228). */
  tokenCardIds: string[];
}

// ─── Views (migration 096) ───────────────────────────────────────────────────

/** Every column of `printings` plus a precomputed `canonical_rank` integer. */
type PrintingsOrderedView = PrintingsTable & { canonicalRank: number };

// ─── Database ────────────────────────────────────────────────────────────────

export interface Database {
  // Card data (migration 001, restructured in 007)
  sets: SetsTable;
  setReleases: SetReleasesTable;
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

  // Admin (migration 012), per-section grants (migration 196)
  admins: AdminsTable;
  adminGrants: AdminGrantsTable;

  // Auth tables (migration 003)
  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;
  apiKeys: ApiKeysTable;

  // Collection tracking (migration 009)
  collections: CollectionsTable;
  copies: CopiesTable;
  collectionDeckbuildingPrefs: CollectionDeckbuildingPrefsTable;
  collectionSidebarPrefs: CollectionSidebarPrefsTable;
  collectionEvents: CollectionEventsTable;

  // Admin audit events (migration 201)
  adminEvents: AdminEventsTable;
  decks: DecksTable;
  deckCards: DeckCardsTable;
  deckPlans: DeckPlansTable;
  deckMatchupPlans: DeckMatchupPlansTable;
  deckMatchupSwaps: DeckMatchupSwapsTable;

  // Deck folders (migration 231)
  deckFolders: DeckFoldersTable;
  deckFolderEntries: DeckFolderEntriesTable;

  // Meta archive (migration 235, ADR-014)
  metaEvents: MetaEventsTable;
  metaDecks: MetaDecksTable;
  candidateMetaEvents: CandidateMetaEventsTable;
  candidateMetaDecks: CandidateMetaDecksTable;
  ignoredCandidateMetaEvents: IgnoredCandidateMetaEventsTable;
  ignoredCandidateMetaDecks: IgnoredCandidateMetaDecksTable;
  metaEventSources: MetaEventSourcesTable;
  metaDeckSources: MetaDeckSourcesTable;
  metaCredits: MetaCreditsTable;
  metaDeckSubmissions: MetaDeckSubmissionsTable;

  // Tier lists (migration 237)
  tierLists: TierListsTable;

  // Stream overlay channels (migration 238)
  overlayChannels: OverlayChannelsTable;

  // Saved creator-tool dressing (migration 242)
  stagePresets: StagePresetsTable;

  lists: ListsTable;
  listEntries: ListEntriesTable;

  // Friend groups (migration 134, ADR-013)
  friendGroups: FriendGroupsTable;
  friendGroupMembers: FriendGroupMembersTable;
  friendGroupInvites: FriendGroupInvitesTable;
  friendGroupDiscordLinks: FriendGroupDiscordLinksTable;
  friendGroupListShares: FriendGroupListSharesTable;
  friendGroupCollectionShares: FriendGroupCollectionSharesTable;

  // Contact methods (migration 162)
  userContactMethods: UserContactMethodsTable;
  friendGroupMemberContacts: FriendGroupMemberContactsTable;

  // Organizations (migration 166, ADR-033)
  organizations: OrganizationsTable;
  organizationMembers: OrganizationMembersTable;

  // Tournaments umbrella (migration 145 as pod_tournaments, renamed 167, ADR-033)
  tournaments: TournamentsTable;
  tournamentStaff: TournamentStaffTable;
  tournamentParticipants: TournamentParticipantsTable;
  tournamentTeams: TournamentTeamsTable;
  podRounds: PodRoundsTable;
  pods: PodsTable;
  podMembers: PodMembersTable;
  podByes: PodByesTable;

  // Card trades (migration 143, ADR-019)
  cardTrades: CardTradesTable;
  cardTradeCopies: CardTradeCopiesTable;

  // Loans (migration 195, ADR-039)
  loans: LoansTable;
  loanCopies: LoanCopiesTable;

  // Deck check (migration 149, ADR-025; re-parented to tournaments in 169/170)
  deckCheckEntries: DeckCheckEntriesTable;
  deckCheckEntryCards: DeckCheckEntryCardsTable;
  deckCheckKeys: DeckCheckKeysTable;

  // Candidate cards (migration 018, renamed in 038)
  candidateCards: CandidateCardsTable;
  candidatePrintings: CandidatePrintingsTable;
  cardNameAliases: CardNameAliasesTable;

  // Ignored candidates (migration 031, renamed in 038)
  ignoredCandidateCards: IgnoredCandidateCardsTable;
  ignoredCandidatePrintings: IgnoredCandidatePrintingsTable;

  // Card submissions (migration 234, ADR-036)
  cardSubmissions: CardSubmissionsTable;

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

  // Promo source citations (migration 258)
  printingCitations: PrintingCitationsTable;

  // Custom tags (migration 128, categories added in 130)
  customTagCategories: CustomTagCategoriesTable;
  customTags: CustomTagsTable;
  cardCustomTags: CardCustomTagsTable;

  // Printed-tag classification (migration 202)
  tagCategories: TagCategoriesTable;
  tagDefinitions: TagDefinitionsTable;

  // Preconstructed products (migration 198, ADR-015)
  products: ProductsTable;
  productPrintings: ProductPrintingsTable;

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
  cardSizes: CardSizesTable;
  deckFormats: DeckFormatsTable;
  deckZones: DeckZonesTable;
  conditions: ConditionsTable;
  graders: GradersTable;

  // Junction tables (migration 062)
  cardDomains: CardDomainsTable;
  cardSuperTypes: CardSuperTypesTable;
  cardCardTypes: CardCardTypesTable;
  cardTokens: CardTokensTable;

  // Printing events (migration 071)
  printingEvents: PrintingEventsTable;

  // Job runs (migration 101)
  jobRuns: JobRunsTable;

  // Scanner embedding bank metadata (migration 213)
  scanIndex: ScanIndexTable;

  // Materialized views (migration 085)
  mvLatestPrintingPrices: MvLatestPrintingPricesView;
  mvDailyPrintingPrices: MvDailyPrintingPricesView;
  mvCardAggregates: MvCardAggregatesView;

  // Views (migration 096)
  printingsOrdered: PrintingsOrderedView;
}
