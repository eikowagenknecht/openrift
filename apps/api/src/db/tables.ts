import type {
  DeckCheckCardLine,
  DeckCheckChangeSummary,
  DeckCheckClaimSource,
  DeckCheckEntryState,
  DeckCheckEventStatus,
  DeckCheckListLockMode,
  DeckCheckMatchStatus,
  DeckCheckReviewOutcome,
  PodPenaltyBreakdown,
} from "@openrift/shared";
import type {
  ActivityAction,
  ArtVariant,
  CardFace,
  CardType,
  ContactMethodType,
  DeckFormat,
  DeckFormatConfig,
  DeckZone,
  Finish,
  ListIntent,
  ListKind,
  PodPlayerStatus,
  PodResultStatus,
  PodRoundStatus,
  PodScoringScheme,
  PodTournamentStatus,
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
  /** Year stamped on the physical card (e.g. 2025). Differs from set release for reprints. */
  printedYear: number | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// ─── Unified marketplace pricing (migration 022) ────────────────────────────

export type MarketplaceGroupKind = "basic" | "special";

interface MarketplaceGroupsTable {
  id: Generated<string>;
  marketplace: string;
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
  marketplace: string;
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

// ─── Auth (migration 003) ─────────────────────────────────────────────────

interface UsersTable {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  image: string | null;
  shareToken: string | null;
  riotId: string | null;
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
  isInbox: boolean;
  sortOrder: number;
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
   * Writes must be pre-stringified for postgres.js (Bun); reads return
   * the parsed object via `parseFormatConfig`. This Select/Insert split
   * mirrors `user_preferences.data`.
   */
  formatConfig: ColumnType<DeckFormatConfig | null, string | null, string | null>;
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
type TradePricePref = "cm_lowest" | "tcg_lowest" | "ct_zero" | "absolute";
type TradeType = "cards" | "money" | "both";
type Currency = "EUR" | "USD";

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

export type FriendGroupRole = "owner" | "admin" | "judge" | "member";
export type FriendGroupInviteDirection = "invite" | "request";

export interface FriendGroupsTable {
  id: Generated<string>;
  /** CHECK: matches `^[a-z0-9][a-z0-9-]{2,29}$` */
  slug: string;
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

// ─── Pod tournaments (migration 145, ADR-022) ────────────────────────────────
// Lean model: pod_players carries no aggregate columns and there is no
// pod_opponents table. Score, pod tallies, rounds played, and opponent counts
// are derived on read from finalized rounds (the result rows are the single
// source of truth). Stored: raw facts (placement) and write-once engine outputs.

export interface PodTournamentsTable {
  id: Generated<string>;
  ownerUserId: string;
  /** CHECK: length 1..120 */
  name: string;
  status: Generated<PodTournamentStatus>;
  currentRound: Generated<number>;
  scoringScheme: Generated<PodScoringScheme>;
  /** Score points a sat-out (bye) game is worth; CHECK >= 0. Defaults to 3. */
  byePoints: Generated<number>;
  /** Nullable disables the participant report link; unique where not null. */
  reportToken: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PodPlayersTable {
  id: Generated<string>;
  tournamentId: string;
  /** CHECK: length 1..80 */
  displayName: string;
  status: Generated<PodPlayerStatus>;
  /** Round number after which the player was dropped; NULL while active. */
  droppedAfterRound: number | null;
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
  /** CHECK: 3 or 4 */
  size: number;
  /** Engine's write-once penalty breakdown; written pre-stringified, read parsed. */
  penaltyBreakdown: ColumnType<PodPenaltyBreakdown, string, string>;
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
}

// Byes (migration 147). A row records that a player sat a round out; the score
// it is worth is the tournament's bye_points (derived on read — no points
// column). Manual only. Not exported for the same reason as PodMembersTable: no
// module derives a Selectable<> from it.
interface PodByesTable {
  roundId: string;
  playerId: string;
}

// ─── Deck check (migration 149, ADR-025) ─────────────────────────────────────

export interface DeckCheckEventsTable {
  id: Generated<string>;
  groupId: string;
  /** CHECK: length 1..120 */
  name: string;
  eventDate: ColumnType<Date, string, string> | null;
  format: string | null;
  /** Set codes for set-legality flagging; written pre-stringified, read defensively. */
  allowedSets: ColumnType<string[], string, string> | null;
  status: Generated<DeckCheckEventStatus>;
  /** When a submitted list locks against player changes (TR 401.3, ADR-027). */
  listLockMode: Generated<DeckCheckListLockMode>;
  /** Player self-submission opt-in (ADR-026). */
  allowSelfSubmission: Generated<boolean>;
  /** Shared submission capability (plaintext, like the group join code); UNIQUE. */
  submissionToken: string | null;
  submissionsCloseAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DeckCheckEntriesTable {
  id: Generated<string>;
  eventId: string;
  /** Provider's upsert key; UNIQUE per (eventId, externalId). */
  externalId: string;
  /** CHECK: length 1..120 */
  playerName: string;
  /** CHECK: length <= 254 */
  playerEmail: string | null;
  /** Player's Riot ID. CHECK: length <= 120 */
  riotId: string | null;
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
  /** The list as the judge last saw it; written pre-stringified, read defensively. */
  preEditLines: ColumnType<DeckCheckCardLine[], string, string> | null;
  /** CHECK: length <= 4000 */
  notes: string | null;
  /** Diff vs the last judge-reviewed list; written pre-stringified, read defensively. */
  changeSummary: ColumnType<DeckCheckChangeSummary, string, string> | null;
  withdrawnAt: Date | null;
  /** The account link ADR-025 reserved, filled in by ADR-026. */
  claimedUserId: string | null;
  claimSource: DeckCheckClaimSource | null;
  claimedAt: Date | null;
  /** Set on judge unlink; blocks every auto-match path from re-linking. */
  claimBlockedAt: Date | null;
  /** CHECK: length <= 2000; judge-authored, shown to the linked player. */
  playerMessage: string | null;
  /**
   * Provider-issued claim capability (ADR-026 amendment), returned in the
   * ingest response and embedded in the provider's email. Minted at create,
   * backfilled for older rows, minted on any later push that finds it missing.
   */
  claimToken: string | null;
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
  groupId: string;
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

/** Who started the trade. The party who must accept is always the non-initiator. */
type CardTradeInitiator = "giver" | "receiver";

type CardTradeStatus = "pending" | "reserved" | "completed" | "declined" | "cancelled" | "expired";

export interface CardTradesTable {
  id: Generated<string>;
  groupId: string;
  /** Owns the copies (supply / tradelist side). */
  giverUserId: string;
  /** Wants the card (demand / wishlist side). */
  receiverUserId: string;
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
}

interface CardTradeCopiesTable {
  tradeId: string;
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

interface PrintingLinkOverridesTable {
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
  face: CardFace;
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

interface LanguagesTable {
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

// ─── Provider settings (migration 035, renamed in 038) ───────────────────────

interface ProviderSettingsTable {
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
  kind: string;
  version: string;
  comments: string | null;
  importedAt: ColumnType<Date, Date | undefined, Date>;
}

interface RulesTable {
  id: Generated<string>;
  /** CHECK: IN ('core', 'tournament') */
  kind: string;
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
type DeckFormatsTable = ReferenceTable;
type DeckZonesTable = ReferenceTable;

// ─── Printing events (migration 071) ────────────────────────────────────────

interface PrintingEventsTable {
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

interface JobRunsTable {
  id: Generated<string>;
  kind: string;
  trigger: JobTrigger;
  status: JobStatus;
  startedAt: ColumnType<Date, Date | undefined, Date>;
  finishedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  durationMs: ColumnType<number | null, number | null | undefined, number | null>;
  errorMessage: ColumnType<string | null, string | null | undefined, string | null>;
  result: ColumnType<unknown, string | null | undefined, string | null>;
  /** Activity axis: true = succeeded but found no work, false = did work, null
   *  = unclassified (failed runs, jobs without a classifier, pre-migration). */
  noop: ColumnType<boolean | null, boolean | null | undefined, boolean | null>;
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

// ─── Materialized views (migration 085) ─────────────────────────────────────

interface MvLatestPrintingPricesView {
  printingId: string;
  marketplace: string;
  headlineCents: number;
}

interface MvCardAggregatesView {
  cardId: string;
  domains: string[];
  superTypes: string[];
}

// ─── Views (migration 096) ───────────────────────────────────────────────────

/** Every column of `printings` plus a precomputed `canonical_rank` integer. */
type PrintingsOrderedView = PrintingsTable & { canonicalRank: number };

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
  collectionDeckbuildingPrefs: CollectionDeckbuildingPrefsTable;
  collectionEvents: CollectionEventsTable;
  decks: DecksTable;
  deckCards: DeckCardsTable;
  deckPlans: DeckPlansTable;
  deckMatchupPlans: DeckMatchupPlansTable;
  deckMatchupSwaps: DeckMatchupSwapsTable;
  lists: ListsTable;
  listEntries: ListEntriesTable;

  // Friend groups (migration 134, ADR-013)
  friendGroups: FriendGroupsTable;
  friendGroupMembers: FriendGroupMembersTable;
  friendGroupInvites: FriendGroupInvitesTable;
  friendGroupListShares: FriendGroupListSharesTable;
  friendGroupCollectionShares: FriendGroupCollectionSharesTable;

  // Contact methods (migration 162)
  userContactMethods: UserContactMethodsTable;
  friendGroupMemberContacts: FriendGroupMemberContactsTable;

  // Pod tournaments (migration 145, ADR-022)
  podTournaments: PodTournamentsTable;
  podPlayers: PodPlayersTable;
  podRounds: PodRoundsTable;
  pods: PodsTable;
  podMembers: PodMembersTable;
  podByes: PodByesTable;

  // Card trades (migration 143, ADR-019)
  cardTrades: CardTradesTable;
  cardTradeCopies: CardTradeCopiesTable;

  // Deck check (migration 149, ADR-025)
  deckCheckEvents: DeckCheckEventsTable;
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

  // Custom tags (migration 128, categories added in 130)
  customTagCategories: CustomTagCategoriesTable;
  customTags: CustomTagsTable;
  cardCustomTags: CardCustomTagsTable;

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
