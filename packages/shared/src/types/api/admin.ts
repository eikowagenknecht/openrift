import type { CardErrata, DistributionChannelKind } from "../catalog.js";
import type { CardFace, SetType } from "../enums.js";

export interface CandidateCardResponse {
  id: string;
  provider: string;
  externalId: string;
  shortCode: string | null;
  energy: number | null;
  power: number | null;
  might: number | null;
  superTypes: string[];
  type: string | null;
  name: string;
  domains: string[];
  rulesText: string | null;
  effectText: string | null;
  mightBonus: number | null;
  tags: string[];
  extraData: unknown | null;
  checkedAt: string | null;
}

export interface CandidatePrintingResponse {
  id: string;
  candidateCardId: string;
  printingId: string | null;
  shortCode: string;
  setId: string | null;
  setName: string | null;
  rarity: string | null;
  artVariant: string | null;
  isSigned: boolean | null;
  markerSlugs: string[];
  finish: string | null;
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

  checkedAt: string | null;
}

export interface CandidatePrintingGroupResponse {
  mostCommonShortCode: string;
  shortCodes: string[];
  expectedPrintingId: string;
  language: string | null;
}

export interface AdminPrintingImageResponse {
  id: string;
  printingId: string;
  face: CardFace;
  provider: string;
  originalUrl: string | null;
  rehostedUrl: string | null;
  rotation: 0 | 90 | 180 | 270;
  isActive: boolean;
}

export interface CandidateCardSummaryResponse {
  cardSlug: string | null;
  name: string;
  normalizedName: string;
  shortCodes: string[];
  stagingShortCodes: string[];
  candidateCount: number;
  uncheckedCardCount: number;
  uncheckedPrintingCount: number;
  hasFavorite: boolean;
  favoriteStagingShortCodes: string[];
  suggestedCardSlug: string | null;
}

export interface ProviderStatsResponse {
  provider: string;
  cardCount: number;
  printingCount: number;
  lastUpdated: string;
}

interface CandidateCardUploadItem {
  name: string;
  shortCode: string | null;
}

interface CandidateCardUploadUpdatedCard extends CandidateCardUploadItem {
  fields: { field: string; from: unknown; to: unknown }[];
}

export interface CandidateCardUploadResponse {
  provider: string;
  newCards: number;
  removedCards: number;
  updates: number;
  unchanged: number;
  newPrintings: number;
  removedPrintings: number;
  printingUpdates: number;
  printingsUnchanged: number;
  errors: string[];
  newCardDetails: CandidateCardUploadItem[];
  removedCardDetails: CandidateCardUploadItem[];
  updatedCards: CandidateCardUploadUpdatedCard[];
  newPrintingDetails: CandidateCardUploadItem[];
  removedPrintingDetails: CandidateCardUploadItem[];
  updatedPrintings: CandidateCardUploadUpdatedCard[];
}

// ── Admin card detail response types ────────────────────────────────────────

export interface AdminCardResponse {
  id: string;
  slug: string;
  name: string;
  type: string;
  superTypes: string[];
  domains: string[];
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
  keywords: string[];
  errata: CardErrata | null;
  tags: string[];
  comment: string | null;
}

export interface AdminPrintingResponse {
  id: string;
  cardId: string;
  setId: string;
  setName: string | null;
  setSlug: string;
  shortCode: string;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  markerSlugs: string[];
  /** Flat list of channel slugs the printing is currently linked to. */
  distributionChannelSlugs: string[];
  /** Optional: only populated by endpoints that need to render the channel admin UI. */
  markerIds?: string[];
  /** Optional: only populated by endpoints that need to render the channel admin UI. */
  distributionChannels?: AdminPrintingDistributionChannelResponse[];
  finish: string;
  artist: string;
  publicCode: string;
  printedRulesText: string | null;
  printedEffectText: string | null;
  flavorText: string | null;
  printedName: string | null;
  language: string;
  comment: string | null;
  expectedPrintingId: string;
  /** See {@link CatalogPrintingResponse.canonicalRank}. */
  canonicalRank: number;
}

export type AdminMarketplaceName = "tcgplayer" | "cardmarket" | "cardtrader";

/**
 * A marketplace variant visible to a printing. When `ownerPrintingId` differs
 * from the printing this row is shown under, the variant is inherited via
 * sibling fan-out (Cardmarket cross-language aggregate — variants are stored
 * with `variantLanguage = null` and surface on every sibling printing).
 */
export interface AdminPrintingMarketplaceMappingResponse {
  targetPrintingId: string;
  marketplace: AdminMarketplaceName;
  externalId: number;
  productName: string;
  finish: string;
  variantLanguage: string | null;
  ownerPrintingId: string;
  ownerLanguage: string;
}

export interface AdminCardDetailResponse {
  card: AdminCardResponse | null;
  displayName: string;
  sources: CandidateCardResponse[];
  printings: AdminPrintingResponse[];
  candidatePrintings: CandidatePrintingResponse[];
  candidatePrintingGroups: CandidatePrintingGroupResponse[];
  expectedCardId: string;
  printingImages: AdminPrintingImageResponse[];
  setTotals: Record<string, number>;
  marketplaceMappings: AdminPrintingMarketplaceMappingResponse[];
}

export interface UnmatchedCardDetailResponse {
  displayName: string;
  sources: CandidateCardResponse[];
  candidatePrintings: CandidatePrintingResponse[];
  candidatePrintingGroups: CandidatePrintingGroupResponse[];
  defaultCardId: string;
  setTotals: Record<string, number>;
}

// ── Admin list response types ───────────────────────────────────────────────

export interface AdminSetResponse {
  id: string;
  slug: string;
  name: string;
  printedTotal: number | null;
  sortOrder: number;
  releasedAt: string | null;
  released: boolean;
  setType: SetType;
  cardCount: number;
  printingCount: number;
}

export type MarketplaceGroupKind = "basic" | "special";

export interface MarketplaceGroupResponse {
  marketplace: string;
  groupId: number;
  name: string | null;
  abbreviation: string | null;
  groupKind: MarketplaceGroupKind;
  stagedCount: number;
  assignedCount: number;
}

export interface FeatureFlagResponse {
  key: string;
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiteSettingResponse {
  key: string;
  value: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarkerResponse {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DistributionChannelResponse {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  kind: DistributionChannelKind;
  sortOrder: number;
  parentId: string | null;
  childrenLabel: string | null;
  createdAt: string;
  updatedAt: string;
  /** Number of printings currently linked to this channel. */
  printingCount: number;
}

/** Per-printing channel link as exposed by admin endpoints. */
export interface AdminPrintingDistributionChannelResponse {
  channelId: string;
  channelSlug: string;
  distributionNote: string | null;
}

export interface LanguageResponse {
  code: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderSettingResponse {
  provider: string;
  sortOrder: number;
  isHidden: boolean;
  isFavorite: boolean;
}

interface IgnoredProductBase {
  marketplace: string;
  externalId: number;
  productName: string;
  createdAt: string;
}

/** Level 2: the entire upstream product is denied (sealed product, bundles, etc.). */
interface IgnoredProductLevelTwoResponse extends IgnoredProductBase {
  level: "product";
}

/** Level 3: one specific SKU of an otherwise-mapped upstream product is denied. */
interface IgnoredProductLevelThreeResponse extends IgnoredProductBase {
  level: "variant";
  finish: string;
  /** `null` for marketplaces that don't expose language as a SKU dimension (CM/TCG). */
  language: string | null;
}

export type IgnoredProductResponse =
  | IgnoredProductLevelTwoResponse
  | IgnoredProductLevelThreeResponse;

// ── Image rehosting response types ──────────────────────────────────────────

export interface RehostImageResponse {
  total: number;
  rehosted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface UnrehostImagesRequest {
  imageIds: string[];
}

export interface UnrehostImagesResponse {
  total: number;
  unrehosted: number;
  failed: number;
  errors: string[];
}

/**
 * Async-job kickoff response for regenerate-images. The actual progress is
 * tracked on the corresponding `job_runs` row's `result` JSONB; clients
 * poll that row to render progress and decide whether to offer resume.
 */
export interface RegenerateImagesKickoffResponse {
  runId: string;
  status: "running" | "already_running";
}

/**
 * Per-batch checkpoint written to `job_runs.result` while a regenerate job is
 * running, and left in place when the run finishes (succeeded, failed, or
 * cancelled). The `snapshot` is captured at run start so retries iterate the
 * same set even if images were added or removed in the meantime.
 *
 * Resume semantics: when the latest run for `images.regenerate` is `failed`
 * with `lastProcessedIndex < snapshot.length - 1` and `cancelRequested` is
 * false (or true — cancel is treated as a pause), a new run can pick up at
 * `lastProcessedIndex + 1`.
 */
export interface RegenerateImagesCheckpoint {
  snapshot: { imageId: string; rehostedUrl: string }[];
  totalFiles: number;
  /** -1 means nothing processed yet; resume starts at this index + 1. */
  lastProcessedIndex: number;
  /** Sum across resumes (regenerated + failed). */
  processed: number;
  regenerated: number;
  failed: number;
  /** Bounded list of error strings; older entries are dropped past the cap. */
  errors: string[];
  resumedFromRunId: string | null;
  cancelRequested: boolean;
  skipExisting: boolean;
}

export interface ClearRehostedResponse {
  cleared: number;
}

export interface RestoreImageUrlsResponse {
  provider: string;
  updated: number;
}

export interface CleanupOrphanedResponse {
  scanned: number;
  deleted: number;
  errors: string[];
}

export interface RehostStatusSetStats {
  setId: string;
  setName: string;
  total: number;
  rehosted: number;
  external: number;
}

export interface RehostStatusDiskStats {
  totalBytes: number;
  byResolution: { resolution: string; bytes: number; fileCount: number }[];
  sets: { setId: string; bytes: number; fileCount: number }[];
}

export interface RehostStatusResponse {
  total: number;
  rehosted: number;
  external: number;
  orphanedFiles: number;
  sets: RehostStatusSetStats[];
  disk: RehostStatusDiskStats;
}

export interface BrokenImageEntry {
  imageId: string;
  rehostedUrl: string;
  originalUrl: string | null;
  cardSlug: string;
  cardName: string;
  printingShortCode: string;
  setSlug: string;
}

export interface BrokenImagesResponse {
  total: number;
  broken: BrokenImageEntry[];
}

export interface LowResImageEntry {
  imageId: string;
  rehostedUrl: string;
  originalUrl: string | null;
  cardSlug: string;
  cardName: string;
  printingShortCode: string;
  setSlug: string;
  width: number;
  height: number;
}

export interface LowResImagesResponse {
  total: number;
  lowRes: LowResImageEntry[];
}

// ── Price refresh response types ────────────────────────────────────────────

export interface PriceRefreshUpsertCounts {
  total: number;
  new: number;
  updated: number;
  unchanged: number;
}

export interface PriceRefreshResponse {
  transformed: {
    groups: number;
    products: number;
    prices: number;
  };
  upserted: {
    prices: PriceRefreshUpsertCounts;
  };
}

/**
 * Response for an admin endpoint that kicks off a long-running job in the
 * background. The caller gets a `runId` immediately and polls `/admin/job-runs`
 * for progress.
 */
export interface JobRunStartedResponse {
  runId: string;
  /** 'running' for a newly started run, 'already_running' if one was in flight. */
  status: "running" | "already_running";
}

export interface JobRunView {
  id: string;
  kind: string;
  trigger: "cron" | "admin" | "api";
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  /** Per-job summary written by the runJob helper. Shape depends on kind. */
  result: Record<string, unknown> | null;
}

export interface JobRunsListResponse {
  runs: JobRunView[];
}

export interface ClearPricesResponse {
  marketplace: string;
  deleted: { prices: number; variants: number; products: number };
}

// ── Unified marketplace mappings response types ─────────────────────────────

export interface MappingPrintingResponse {
  printingId: string;
  shortCode: string;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  markerSlugs: string[];
  finish: string;
  language: string;
  imageUrl: string | null;
  externalId: number | null;
}

export interface UnifiedMappingPrintingResponse extends Omit<
  MappingPrintingResponse,
  "externalId" | "language"
> {
  language: string;
  tcgExternalId: number | null;
  cmExternalId: number | null;
  ctExternalId: number | null;
}

export interface StagedProductResponse {
  externalId: number;
  productName: string;
  finish: string;
  /**
   * `null` when the marketplace doesn't expose language as a SKU dimension
   * (Cardmarket's cross-language price guide, TCGPlayer's English-only
   * catalog). A real language code otherwise (CardTrader).
   */
  language: string | null;
  marketCents: number | null;
  lowCents: number | null;
  currency: string;
  recordedAt: string;
  midCents: number | null;
  highCents: number | null;
  trendCents: number | null;
  avg1Cents: number | null;
  avg7Cents: number | null;
  avg30Cents: number | null;
  isOverride?: boolean;
  groupId?: number;
  groupName?: string;
  /**
   * Admin-assigned tag for the marketplace group this product belongs to.
   * Drives the suggestion scorer: `basic` penalises promo/special printings,
   * `special` prefers them. Omitted for products whose group resolution
   * wasn't needed (unassigned staging without a group).
   */
  groupKind?: MarketplaceGroupKind;
}

/**
 * A single (product × printing) mapping row. Authoritative: survives cases
 * where one printing is bound to multiple variants of the same marketplace
 * (can happen when two upstream products target the same printing).
 * `language` is `null` when the marketplace doesn't expose language as a
 * SKU dimension (CM/TCG).
 */
export interface MarketplaceAssignmentResponse {
  externalId: number;
  printingId: string;
  finish: string;
  language: string | null;
}

export interface UnifiedMappingGroupResponse {
  cardId: string;
  cardSlug: string;
  cardName: string;
  cardType: string;
  superTypes: string[];
  domains: string[];
  energy: number | null;
  might: number | null;
  setId: string;
  setName: string;
  printings: UnifiedMappingPrintingResponse[];
  primaryShortCode: string;
  tcgplayer: {
    stagedProducts: StagedProductResponse[];
    assignedProducts: StagedProductResponse[];
    assignments: MarketplaceAssignmentResponse[];
  };
  cardmarket: {
    stagedProducts: StagedProductResponse[];
    assignedProducts: StagedProductResponse[];
    assignments: MarketplaceAssignmentResponse[];
  };
  cardtrader: {
    stagedProducts: StagedProductResponse[];
    assignedProducts: StagedProductResponse[];
    assignments: MarketplaceAssignmentResponse[];
  };
}

export interface AssignableCardResponse {
  cardId: string;
  cardSlug: string;
  cardName: string;
  setName: string;
  /** Short codes of this card's printings (first one, sorted, is shown in the assign dropdown). */
  shortCodes: string[];
}

export interface AdminUserResponse {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  isAdmin: boolean;
  cardCount: number;
  deckCount: number;
  collectionCount: number;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface UnifiedMappingsResponse {
  groups: UnifiedMappingGroupResponse[];
  unmatchedProducts: {
    tcgplayer: StagedProductResponse[];
    cardmarket: StagedProductResponse[];
    cardtrader: StagedProductResponse[];
  };
  allCards: AssignableCardResponse[];
}

/** Single-card variant of {@link UnifiedMappingsResponse} for the admin card-detail page. */
export interface UnifiedMappingsCardResponse {
  /** Null when the card has no printings or no marketplace activity — UI shows an empty state. */
  group: UnifiedMappingGroupResponse | null;
  allCards: AssignableCardResponse[];
}
