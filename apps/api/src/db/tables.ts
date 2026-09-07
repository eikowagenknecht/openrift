import type {
  DeckCheckCardLine,
  DeckCheckChangeSummary,
  DeckCheckEntryState,
  DeckCheckMatchStatus,
  DeckCheckReviewOutcome,
  PodPenaltyBreakdown,
} from "@openrift/shared";
import type { ScanReportJournalEntry } from "@openrift/shared/contracts/scan-reports";
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

type CreatedAt = ColumnType<Date, Date | undefined, Date>;

type UpdatedAt = ColumnType<Date, Date | undefined, Date>;

export interface SetsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  printedTotal: number | null;
  sortOrder: Generated<number>;
  setType: Generated<"main" | "supplemental">;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

type ReleasePrecision = "day" | "month" | "quarter" | "year";

interface SetReleasesTable {
  setId: string;
  language: string;
  releasedAt: string | null;
  precision: ReleasePrecision | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CardsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  normName: Generated<string>;
  type: CardType;
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
  keywords: Generated<string[]>;
  tags: Generated<string[]>;
  maxCopiesOverride: number | null;
  comment: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CardErrataTable {
  id: Generated<string>;
  cardId: string;
  correctedRulesText: string | null;
  correctedEffectText: string | null;
  source: string;
  sourceUrl: string | null;
  /** `date` column: the driver returns it as `"YYYY-MM-DD"` text, not a `Date` (OID 1082 override in `db/connect.ts`). */
  effectiveDate: ColumnType<string | null, string | Date | null | undefined, string | Date | null>;
  createdAt: CreatedAt;
}

export interface PrintingsTable {
  id: Generated<string>;
  cardId: string;
  setId: string;
  shortCode: string;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: Generated<boolean>;
  isOvernumbered: Generated<boolean>;
  markerSlugs: Generated<string[]>;
  finish: Finish;
  size: Generated<CardSize>;
  artist: string;
  publicCode: string;
  printedRulesText: string | null;
  printedEffectText: string | null;
  flavorText: string | null;
  comment: string | null;
  language: Generated<string>;
  printedName: string | null;
  printedYear: number | null;
  fallbackArtMode: Generated<FallbackArtMode>;
  fallbackImageFileId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface MarketplaceGroupsTable {
  id: Generated<string>;
  marketplace: Marketplace;
  groupId: number;
  name: string | null;
  abbreviation: string | null;
  groupKind: Generated<MarketplaceGroupKind>;
  setId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface MarketplaceProductsTable {
  id: Generated<string>;
  marketplace: Marketplace;
  externalId: number;
  groupId: number;
  productName: string;
  normName: Generated<string>;
  finish: string;
  language: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface MarketplaceProductVariantsTable {
  id: Generated<string>;
  marketplaceProductId: string;
  printingId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MarketplaceProductPricesTable {
  marketplaceProductId: string;
  recordedAt: Date;
  marketCents: number | null;
  lowCents: number | null;
  zeroLowCents: number | null;
  midCents: number | null;
  highCents: number | null;
  trendCents: number | null;
  avg1Cents: number | null;
  avg7Cents: number | null;
  avg30Cents: number | null;
  createdAt: CreatedAt;
}

interface MarketplaceIgnoredProductsTable {
  marketplace: Marketplace;
  externalId: number;
  productName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface MarketplaceIgnoredVariantsTable {
  marketplaceProductId: string;
  productName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

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

interface ApiKeysTable {
  id: string;
  configId: Generated<string>;
  name: string | null;
  start: string | null;
  prefix: string | null;
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

export interface CollectionsTable {
  id: Generated<string>;
  userId: string | null;
  groupId: string | null;
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
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
  notesPrivate: string | null;
  isAltered: Generated<boolean>;
  links: ColumnType<CopyLink[], CopyLink[] | undefined, CopyLink[]>;
}

interface CollectionDeckbuildingPrefsTable {
  userId: string;
  collectionId: string;
  available: boolean;
}

interface CollectionSidebarPrefsTable {
  userId: string;
  collectionId: string;
  hidden: boolean;
}

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

/** Enforced here, not by a DB CHECK, so adding an action needs no migration. */
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
 * actorUserId has no FK, so rows survive user deletion. Check/uncheck
 * bookkeeping is deliberately not logged.
 */
interface AdminEventsTable {
  id: Generated<string>;
  actorUserId: string;
  action: AdminEventAction;
  entityType: AdminEventEntityType;
  entityId: string | null;
  entityLabel: string | null;
  cardSlug: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: CreatedAt;
}

export interface DecksTable {
  id: Generated<string>;
  userId: string;
  name: string;
  description: string | null;
  format: DeckFormat;
  formatConfig: DeckFormatConfig | null;
  oddsConfig: DeckOddsConfig | null;
  isPublic: Generated<boolean>;
  shareToken: string | null;
  isPinned: Generated<boolean>;
  archivedAt: Date | null;
  coverCardId: string | null;
  coverPrintingId: string | null;
  coverPosition: number | null;
  links: ColumnType<DeckLink[], DeckLink[] | undefined, DeckLink[]>;
  collectionId: string | null;
  familyId: string | null;
  predecessorDeckId: string | null;
  isPrimary: Generated<boolean>;
  isDraft: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DeckCardsTable {
  id: Generated<string>;
  deckId: string;
  cardId: string;
  zone: DeckZone;
  quantity: Generated<number>;
  preferredPrintingId: string | null;
}

export interface DeckPlansTable {
  id: Generated<string>;
  deckId: string;
  generalStrategy: Generated<string>;
  mulliganSplit: Generated<boolean>;
  mulliganGeneral: Generated<string>;
  mulliganFirst: Generated<string>;
  mulliganSecond: Generated<string>;
  battlefieldG1CardId: string | null;
  battlefieldFirstCardId: string | null;
  battlefieldSecondCardId: string | null;
  battlefieldCustom: Generated<boolean>;
  battlefieldNote: Generated<string>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DeckMatchupPlansTable {
  id: Generated<string>;
  deckId: string;
  opponentCardId: string | null;
  opponentLabel: Generated<string>;
  notes: Generated<string>;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DeckMatchupSwapsTable {
  id: Generated<string>;
  planId: string;
  cardId: string;
  direction: "in" | "out";
  quantity: number;
}

export interface DeckFoldersTable {
  id: Generated<string>;
  userId: string;
  name: string;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface OverlayChannelsTable {
  id: Generated<string>;
  userId: string;
  token: string;
  payload: ColumnType<OverlayPayload, OverlayPayload | undefined, OverlayPayload>;
  version: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface StagePresetsTable {
  id: Generated<string>;
  userId: string;
  name: string;
  config: ColumnType<StagePresetConfig, StagePresetConfig | undefined, StagePresetConfig>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface DeckFolderEntriesTable {
  folderId: string;
  deckId: string;
  userId: string;
  createdAt: CreatedAt;
}

export interface TierListCard {
  cardId: string;
  printingId: string | null;
}

export interface TierListRow {
  label: string;
  cards: TierListCard[];
  unranked?: boolean;
}

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

export interface UvsgamesEventsTable {
  externalId: string;
  name: string;
  startAt: Date;
  endAtEstimate: Date | null;
  displayStatus: string;
  decklistStatus: string | null;
  playerCount: number | null;
  eventType: string | null;
  eventFormat: string | null;
  storeId: number | null;
  storeName: string | null;
  location: string | null;
  timezone: string | null;
  contentHash: string;
  firstSeenAt: Generated<Date>;
  lastSeenAt: Date;
  missingSince: Date | null;
  eventConfigurationTemplate: string | null;
  resultsFetchedAt: Date | null;
}

interface UvsgamesEventTemplatesTable {
  templateId: string;
  sourceName: string | null;
  watched: Generated<boolean>;
  tier: MetaEventTier | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface UvsgamesFormatMappingsTable {
  sourceFormat: string;
  mappedFormat: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface UvsgamesStoresTable {
  id: number;
  name: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface UvsgamesPlayersTable {
  id: number;
  displayName: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** Riftbound ids are deliberately absent here; they land in `uvsgames_events` instead. */
interface UvsgamesIdProbesTable {
  externalId: number;
  outcome: string;
  gameType: string | null;
  probedAt: Generated<Date>;
}

interface UvsgamesEventChecksTable {
  externalId: string;
  nextCheckAt: Date | null;
  checkStage: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface PlayloltcgShopsTable {
  id: number;
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

export interface PlayloltcgEventsTable {
  activityShopId: number;
  shopId: number | null;
  shopName: string | null;
  name: string;
  activityType: string | null;
  activityTypeName: string | null;
  battleMode: string | null;
  status: number | null;
  /** `date` column: the driver returns it as `"YYYY-MM-DD"` text, not a `Date` (OID 1082 override in `db/connect.ts`). */
  startAt: string | null;
  endAt: string | null;
  playerCount: number | null;
  maxUser: number | null;
  fee: number | null;
  province: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  contentHash: string;
  firstSeenAt: Generated<Date>;
  lastSeenAt: Date;
  missingSince: Date | null;
}

interface PlayloltcgEventChecksTable {
  activityShopId: number;
  nextCheckAt: Date | null;
  checkStage: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface MetaSyncSettingsTable {
  id: number;
  autoAcceptMinPlayers: number | null;
  autoAcceptNotable: Generated<boolean>;
  autoAcceptOfficial: Generated<boolean>;
  competitivePlayerFloor: Generated<number>;
  updatedAt: UpdatedAt;
}

export interface MetaEventsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  /** `date` column: the driver returns it as `"YYYY-MM-DD"` text, not a `Date` (OID 1082 override in `db/connect.ts`). */
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  notes: string | null;
  tier: ColumnType<MetaEventTier, MetaEventTier | undefined, MetaEventTier>;
  country: string | null;
  location: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MetaEventPlayersTable {
  id: Generated<string>;
  metaEventId: string;
  rank: number;
  rankIsTier: Generated<boolean>;
  playerName: string | null;
  uvsgamesPlayerId: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
  entryStatus: MetaEntryStatus | null;
  legendCardId: string | null;
  championCardId: string | null;
  sourceIdentity: string | null;
  mintedByOverlayId: string | null;
  deckId: string | null;
  listStatus: Generated<MetaListStatus>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MetaEventMatchesTable {
  id: Generated<string>;
  metaEventId: string;
  sourceMatchId: string | null;
  sourceRoundId: string | null;
  phaseOrder: Generated<number>;
  roundNumber: number;
  tableNumber: number | null;
  isBye: Generated<boolean>;
  isDraw: Generated<boolean>;
  player1Id: string;
  player2Id: string | null;
  winnerId: string | null;
  gamesWonP1: number | null;
  gamesWonP2: number | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MetaEventPhasesTable {
  id: Generated<string>;
  metaEventId: string;
  phaseOrder: number;
  name: string | null;
  roundType: string;
  roundCount: number | null;
  rankRequired: number | null;
  maxGameWins: number | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface UvsgamesEventStandingsTable {
  externalId: string;
  registrationId: string;
  uvsgamesPlayerId: number | null;
  playerName: string | null;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
  entryStatus: MetaEntryStatus | null;
  legendName: string | null;
  sourceDeckId: string | null;
  fetchedAt: CreatedAt;
}

export interface UvsgamesEventPhasesTable {
  externalId: string;
  phaseOrder: number;
  name: string | null;
  roundType: string;
  roundCount: number | null;
  rankRequired: number | null;
  maxGameWins: number | null;
}

export interface UvsgamesEventMatchesTable {
  externalId: string;
  roundId: string;
  sourceMatchId: string;
  phaseOrder: Generated<number>;
  roundNumber: number;
  tableNumber: number | null;
  isBye: Generated<boolean>;
  isDraw: Generated<boolean>;
  player1UvsgamesId: number;
  player2UvsgamesId: number | null;
  winnerUvsgamesId: number | null;
  gamesWonP1: number | null;
  gamesWonP2: number | null;
}

export interface UvsgamesDecklistsTable {
  sourceDeckId: string;
  externalId: string;
  fetchStatus: MetaSourceFetchStatus;
  fetchedAt: CreatedAt;
}

export interface UvsgamesDecklistCardsTable {
  sourceDeckId: string;
  lineNumber: number;
  zone: string;
  quantity: number;
  cardName: string;
}

export interface PlayloltcgEventStandingsTable {
  activityShopId: number;
  playerKey: string;
  sourceUserId: number | null;
  playerName: string;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  legendName: string | null;
  sourceDeckId: string | null;
  fetchedAt: CreatedAt;
}

export interface PlayloltcgDecklistsTable {
  sourceDeckId: string;
  activityShopId: number;
  fetchStatus: MetaSourceFetchStatus;
  fetchedAt: CreatedAt;
}

export interface PlayloltcgDecklistCardsTable {
  sourceDeckId: string;
  lineNumber: number;
  zone: string;
  quantity: number;
  cardName: string;
}

export interface TopdeckEventsTable {
  tid: string;
  name: string;
  format: string;
  startAt: Date;
  swissRounds: number | null;
  topCut: number | null;
  playerCount: number | null;
  isTeamEvent: Generated<boolean>;
  teamSize: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  contentHash: string;
  firstSeenAt: Generated<Date>;
  lastSeenAt: Date;
  missingSince: Date | null;
}

export interface TopdeckEventStandingsTable {
  tid: string;
  playerKey: string;
  sourcePlayerId: string | null;
  playerName: string;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  legendName: string | null;
  sourceDeckId: string | null;
  fetchedAt: CreatedAt;
}

export interface TopdeckDecklistsTable {
  sourceDeckId: string;
  tid: string;
  fetchStatus: MetaSourceFetchStatus;
  fetchedAt: CreatedAt;
}

export interface TopdeckDecklistCardsTable {
  sourceDeckId: string;
  lineNumber: number;
  zone: string;
  quantity: number;
  cardName: string;
}

export interface MetaEventOverlaysTable {
  id: Generated<string>;
  metaEventId: string | null;
  provider: string | null;
  externalId: string | null;
  name: string | null;
  eventDate: string | null;
  format: string | null;
  playerCount: number | null;
  organizer: string | null;
  notes: string | null;
  tier: MetaEventTier | null;
  country: string | null;
  location: string | null;
  claimedFields: MetaEventOverlayField[];
  status: Generated<MetaOverlayStatus>;
  submittedByUserId: string;
  submissionNote: string | null;
  acceptedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MetaEventPlayerOverlaysTable {
  id: Generated<string>;
  metaEventPlayerId: string | null;
  metaEventId: string | null;
  eventOverlayId: string | null;
  playerName: string | null;
  rank: number | null;
  rankIsTier: boolean | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
  entryStatus: MetaEntryStatus | null;
  legendCardId: string | null;
  championCardId: string | null;
  listStatus: MetaListStatus | null;
  provider: string | null;
  sourcePlayerKey: string | null;
  claimedFields: MetaPlayerOverlayField[];
  status: Generated<MetaOverlayStatus>;
  submittedByUserId: string;
  submissionNote: string | null;
  acceptedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MetaEventPlayerOverlayCardsTable {
  overlayId: string;
  lineNumber: number;
  zone: string;
  quantity: number;
  cardName: string;
  cardId: string | null;
  preferredPrintingId: string | null;
}

interface IgnoredMetaSourceEventsTable {
  provider: string;
  externalId: string;
  createdAt: CreatedAt;
}

interface IgnoredMetaSourcePlayersTable {
  provider: string;
  eventExternalId: string;
  externalId: string;
  createdAt: CreatedAt;
}

export interface MetaEventSourcesTable {
  id: Generated<string>;
  metaEventId: string;
  provider: string | null;
  externalId: string | null;
  label: string;
  sourceUrl: string | null;
  priority: Generated<number>;
  contributes: Generated<boolean>;
  createdAt: CreatedAt;
}

export interface MetaPlayerLinksTable {
  id: Generated<string>;
  metaEventId: string;
  provider: string;
  sourceIdentity: string;
  metaEventPlayerId: string | null;
  createdAt: CreatedAt;
}

interface MetaCreditsTable {
  id: Generated<string>;
  metaEventId: string;
  metaEventPlayerId: string | null;
  userId: string;
  createdAt: CreatedAt;
}

export interface MetaSubmissionsTable {
  id: Generated<string>;
  userId: string;
  provider: string;
  externalId: string;
  playerOverlayId: string | null;
  metaEventId: string | null;
  eventName: string;
  playerName: string | null;
  kind: Generated<MetaSubmissionKind>;
  fieldEdits: MetaEventFieldEdits | null;
  note: string | null;
  status: Generated<MetaSubmissionStatus>;
  resolutionReason: MetaSubmissionReason | null;
  resolutionNote: string | null;
  resolvedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  resolvedByUserId: string | null;
  acceptedDeckId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

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
  defaultPricePref: TradePricePref | null;
  defaultPriceAbsoluteCents: number | null;
  defaultTradeType: TradeType | null;
  currency: Currency | null;
  sortOrder: Generated<number>;
  sidebarHidden: Generated<boolean>;
  rules: ColumnType<ListRules, ListRules | undefined, ListRules>;
  ruleCombine: ListRuleCombine | null;
}

export interface ListEntriesTable {
  id: Generated<string>;
  listId: string;
  userId: string;
  kind: ListKind;
  cardId: string | null;
  printingId: string | null;
  copyId: string | null;
  quantity: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  pricePref: TradePricePref | null;
  priceAbsoluteCents: number | null;
  tradeType: TradeType | null;
}

export interface FriendGroupsTable {
  id: Generated<string>;
  slug: string;
  previousSlug: string | null;
  name: string;
  description: string | null;
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

interface UserContactMethodsTable {
  id: Generated<string>;
  userId: string;
  type: ContactMethodType;
  value: string;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

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

export interface FriendGroupDiscordLinksTable {
  id: Generated<string>;
  groupId: string;
  guildId: string | null;
  guildName: string | null;
  code: string | null;
  codeExpiresAt: Date | null;
  createdByUserId: string | null;
  createdAt: CreatedAt;
  linkedAt: Date | null;
  tradeChannelIds: Generated<string[]>;
}

// A deferred constraint trigger keeps every org at one owner-role member or more.

export interface OrganizationsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  description: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface OrganizationMembersTable {
  orgId: string;
  userId: string;
  role: OrganizationRole;
  joinedAt: CreatedAt;
}

// Pod pairing state is derived on read: pod_players carries no aggregate
// columns, and there is no pod_opponents table.

export interface TournamentsTable {
  id: Generated<string>;

  hostType: TournamentHostType;
  hostUserId: string | null;
  hostOrgId: string | null;

  groupId: string | null;

  name: string;
  status: Generated<TournamentStatus>;
  startsAt: Generated<Date>;
  endsAt: Date | null;

  pairingStyle: Generated<TournamentPairingStyle>;
  playMode: Generated<TournamentPlayMode>;
  currentRound: Generated<number>;
  scoringScheme: Generated<PodScoringScheme>;
  byePoints: Generated<number>;
  matchFormat: Generated<TournamentMatchFormat>;
  winPoints: Generated<number>;
  drawPoints: Generated<number>;
  regionsEnabled: Generated<boolean>;

  deckSubmission: Generated<TournamentDeckSubmission>;

  deckPhase: Generated<TournamentDeckPhase>;
  submissionsCloseAt: Date | null;
  listLockMode: Generated<TournamentListLockMode>;
  deckFormat: string | null;
  allowedSets: string[] | null;
  selfRegistration: Generated<boolean>;

  reportToken: string | null;
  followToken: string | null;
  submissionToken: string | null;
  organizerInviteToken: string | null;
  judgeInviteToken: string | null;

  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

// Not exported: no module derives a Selectable<> from it, so exporting it
// would trip knip's unused-export check.
interface TournamentStaffTable {
  tournamentId: string;
  userId: string;
  role: TournamentStaffRole;
  addedAt: CreatedAt;
}

// Not exported: only the Database interface references it.
interface TournamentTeamsTable {
  id: Generated<string>;
  tournamentId: string;
  createdAt: CreatedAt;
}

export interface TournamentParticipantsTable {
  id: Generated<string>;
  tournamentId: string;
  userId: string | null;
  displayName: string;
  riotId: string | null;
  status: Generated<TournamentParticipantStatus>;
  droppedAfterRound: number | null;
  seed: number | null;
  teamId: string | null;
  region: string | null;
  fixedTable: number | null;
  claimSource: TournamentClaimSource | null;
  claimToken: string | null;
  claimedAt: Date | null;
  claimBlockedAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PodRoundsTable {
  id: Generated<string>;
  tournamentId: string;
  roundNumber: number;
  status: Generated<PodRoundStatus>;
  penaltyTotal: number;
  pairingStrategy: string;
  createdAt: CreatedAt;
  finalizedAt: Date | null;
}

export interface PodsTable {
  id: Generated<string>;
  roundId: string;
  podNumber: number;
  size: number;
  penaltyBreakdown: PodPenaltyBreakdown;
  resultStatus: Generated<PodResultStatus>;
}

// Not exported: no module derives a Selectable<> from it, so knip flags a
// public export.
interface PodMembersTable {
  podId: string;
  playerId: string;
  placement: number | null;
  gamePoints: number | null;
  seat: number | null;
}

// Not exported, for the same reason as PodMembersTable.
interface PodByesTable {
  roundId: string;
  playerId: string;
}

export interface DeckCheckEntriesTable {
  id: Generated<string>;
  tournamentId: string;
  participantId: string | null;
  externalId: string;
  submittedAt: Date | null;
  allowDeckPublishing: Generated<boolean>;
  allowNameSharing: Generated<boolean>;
  allowRiotIdSharing: Generated<boolean>;
  contentHash: string;
  state: Generated<DeckCheckEntryState>;
  reviewOutcome: DeckCheckReviewOutcome | null;
  checkedBy: string | null;
  checkedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  unlockRequestedAt: Date | null;
  preEditLines: DeckCheckCardLine[] | null;
  notes: string | null;
  changeSummary: DeckCheckChangeSummary | null;
  withdrawnAt: Date | null;
  playerMessage: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DeckCheckEntryCardsTable {
  id: Generated<string>;
  entryId: string;
  sortOrder: number;
  rawName: string;
  section: string;
  zone: string;
  quantity: number;
  resolvedCardId: string | null;
  resolvedPrintingId: string | null;
  matchStatus: DeckCheckMatchStatus;
  foundCopies: Generated<(boolean | null)[]>;
}

export interface DeckCheckKeysTable {
  id: Generated<string>;
  hostType: TournamentHostType;
  hostUserId: string | null;
  hostOrgId: string | null;
  tokenHash: string;
  tokenPrefix: string;
  label: string | null;
  createdBy: string | null;
  createdAt: CreatedAt;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface CardTradesTable {
  id: Generated<string>;
  groupId: string | null;
  groupName: string | null;
  giverUserId: string | null;
  giverName: string | null;
  receiverUserId: string | null;
  receiverName: string | null;
  initiator: CardTradeInitiator;
  printingId: string;
  cardId: string;
  quantity: number;
  status: Generated<CardTradeStatus>;
  receiverWishEntryId: string | null;
  lastActorUserId: string | null;
  giverSyncAppliedAt: Date | null;
  receiverSyncAppliedAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  acceptedAt: Date | null;
  completedAt: Date | null;
  closedAt: Date | null;
  expiresAt: Date | null;
  requestEmailSentAt: Date | null;
  reservedEmailSentAt: Date | null;
  closedEmailSentAt: Date | null;
}

interface CardTradeCopiesTable {
  tradeId: string;
  copyId: string;
}

export interface LoansTable {
  id: Generated<string>;
  lenderUserId: string;
  borrowerUserId: string | null;
  borrowerName: string | null;
  printingId: string;
  cardId: string;
  quantity: number;
  returnedQuantity: Generated<number>;
  status: Generated<LoanStatus>;
  acknowledgedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  closedAt: Date | null;
}

interface LoanCopiesTable {
  loanId: string;
  copyId: string;
}

export interface CandidateCardsTable {
  id: Generated<string>;
  provider: string;
  name: string;
  normName: Generated<string>;
  types: Generated<string[]>;
  superTypes: Generated<string[]>;
  domains: string[];
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
  rulesText: string | null;
  effectText: string | null;
  tags: Generated<string[]>;
  shortCode: string | null;
  externalId: string;
  extraData: unknown | null;
  submittedByUserId: string | null;
  submissionNote: string | null;
  checkedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CandidatePrintingsTable {
  id: Generated<string>;
  candidateCardId: string;
  printingId: string | null;
  shortCode: string;
  setId: string | null;
  setName: string | null;
  rarity: string | null;
  artVariant: string | null;
  isSigned: boolean | null;
  isOvernumbered: boolean | null;
  markerSlugs: Generated<string[]>;
  distributionChannelSlugs: Generated<string[]>;
  finish: string | null;
  size: string | null;
  artist: string | null;
  publicCode: string | null;
  printedRulesText: string | null;
  printedEffectText: string | null;
  imageUrl: string | null;
  flavorText: string | null;
  externalId: string;
  extraData: unknown | null;

  language: string | null;
  printedName: string | null;
  printedYear: number | null;

  checkedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface IgnoredCandidateCardsTable {
  id: Generated<string>;
  provider: string;
  externalId: string;
  createdAt: CreatedAt;
}

export interface IgnoredCandidatePrintingsTable {
  id: Generated<string>;
  provider: string;
  externalId: string;
  finish: string | null;
  createdAt: CreatedAt;
}

export type CardSubmissionKind = "new_card" | "correction" | "image";

export type CardSubmissionStatus =
  | "pending"
  | "accepted"
  | "already_correct"
  | "not_applied"
  | "rejected";

export type CardSubmissionReason =
  | "duplicate"
  | "already_correct"
  | "unverified"
  | "not_a_card"
  | "bad_image";

export interface CardSubmissionsTable {
  id: Generated<string>;
  userId: string;
  provider: string;
  externalId: string;
  candidateCardId: string | null;
  kind: CardSubmissionKind;
  cardName: string;
  cardSlug: string | null;
  note: string | null;
  proposedDiff: ColumnType<string[], string[] | undefined, string[]>;
  status: ColumnType<CardSubmissionStatus, CardSubmissionStatus | undefined, CardSubmissionStatus>;
  resolutionReason: CardSubmissionReason | null;
  resolutionNote: string | null;
  resolvedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  resolvedByUserId: string | null;
  acceptedCardId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface ScanReportsTable {
  id: Generated<string>;
  userId: string;
  createdAt: CreatedAt;
  reference: string;
  note: string | null;
  userAgent: string | null;
  journal: ScanReportJournalEntry[];
}

interface PrintingLinkOverridesTable {
  externalId: string;
  finish: string;
  provider: string;
  printingId: string;
  createdAt: CreatedAt;
}

// Must stay exported — TypeScript names it in inferred Kysely query return
// types (e.g. selectCopyWithCard in repositories/query-helpers.ts).
// oxlint-disable-next-line jsdoc/check-tag-names -- @public is consumed by knip to suppress the unused-export warning
/** @public */
export interface ImageFilesTable {
  id: Generated<string>;
  originalUrl: string | null;
  rehostedUrl: string | null;
  rotation: Generated<0 | 90 | 180 | 270>;
  needsTrim: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PrintingImagesTable {
  id: Generated<string>;
  printingId: string;
  face: Generated<CardFace>;
  imageFileId: string;
  isActive: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface CardNameAliasesTable {
  normName: string;
  cardId: string;
}

interface LanguagesTable {
  code: string;
  name: string;
  color: string | null;
  sortOrder: Generated<number>;
  isWellKnown: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MarkersTable {
  id: Generated<string>;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface PrintingMarkersTable {
  printingId: string;
  markerId: string;
}

interface CustomTagCategoriesTable {
  id: Generated<string>;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface CustomTagsTable {
  id: Generated<string>;
  slug: string;
  label: string;
  categoryId: string;
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface CardCustomTagsTable {
  cardId: string;
  customTagId: string;
}

interface TagCategoriesTable {
  id: Generated<string>;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface TagDefinitionsTable {
  id: Generated<string>;
  tag: string;
  categoryId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface ProductsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  description: string | null;
  setId: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface ProductPrintingsTable {
  productId: string;
  printingId: string;
  quantity: number;
}

interface DistributionChannelsTable {
  id: Generated<string>;
  slug: string;
  label: string;
  description: string | null;
  kind: Generated<"event" | "product">;
  sortOrder: Generated<number>;
  parentId: string | null;
  childrenLabel: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface PrintingDistributionChannelsTable {
  printingId: string;
  channelId: string;
  distributionNote: string | null;
}

interface PrintingCitationsTable {
  id: Generated<string>;
  printingId: string;
  label: string;
  sourceUrl: string | null;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
}

interface ProviderSettingsTable {
  provider: string;
  sortOrder: Generated<number>;
  isHidden: Generated<boolean>;
  isFavorite: Generated<boolean>;
  helperReviewable: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface KeywordsTable {
  name: string;
  color: string;
  darkText: Generated<boolean>;
  isWellKnown: Generated<boolean>;
  costKeyword: ColumnType<boolean, boolean | undefined, boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

interface KeywordTranslationsTable {
  keywordName: string;
  language: string;
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
  key: string;
  value: string;
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
  id: string;
  name: string;
  createdAt: CreatedAt;
}

export interface CardBansTable {
  id: Generated<string>;
  cardId: string;
  formatId: string;
  bannedAt: string;
  unbannedAt: string | null;
  reason: string | null;
  createdAt: CreatedAt;
}

interface RuleVersionsTable {
  kind: RuleKind;
  version: string;
  comments: string | null;
  importedAt: ColumnType<Date, Date | undefined, Date>;
}

interface RulesTable {
  id: Generated<string>;
  kind: RuleKind;
  version: string;
  ruleNumber: string;
  sortOrder: number;
  depth: number;
  ruleType: RuleType;
  content: string;
  changeType: Generated<RuleChangeType>;
  createdAt: CreatedAt;
}

export interface ReferenceTable {
  slug: string;
  label: string;
  sortOrder: number;
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
  noop: ColumnType<boolean | null, boolean | null | undefined, boolean | null>;
}

interface JobSchedulesTable {
  kind: string;
  schedule: string;
  updatedAt: UpdatedAt;
}

/** `encoderTag` names the encoder file the bank was built with; it and the browser encoder must always match. */
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

interface CardCardTypesTable {
  cardId: string;
  typeSlug: string;
  position: number;
}

/**
 * Exported as a value so the enum-CHECK parity test can compare it against
 * `chk_card_tokens_source`.
 */
export const CARD_TOKEN_SOURCES = ["derived", "manual"] as const;

interface CardTokensTable {
  cardId: string;
  tokenCardId: string;
  source: Generated<(typeof CARD_TOKEN_SOURCES)[number]>;
}

interface MvLatestPrintingPricesView {
  printingId: string;
  marketplace: string;
  headlineCents: number;
  /** A date, not a timestamp. */
  lastSeen: string;
}

/** `day` is a date, not a timestamp. */
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
  tokenCardIds: string[];
}

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
  topdeckEvents: TopdeckEventsTable;
  topdeckEventStandings: TopdeckEventStandingsTable;
  topdeckDecklists: TopdeckDecklistsTable;
  topdeckDecklistCards: TopdeckDecklistCardsTable;
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
  metaPlayerLinks: MetaPlayerLinksTable;
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
  scanReports: ScanReportsTable;

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
