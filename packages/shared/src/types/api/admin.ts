import type { CardErrata } from "../catalog.js";
import type { CardFace } from "../enums.js";

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
  collectorNumber: number | null;
  rarity: string | null;
  artVariant: string | null;
  isSigned: boolean | null;
  promoTypeId: string | null;
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
  collectorNumber: number;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  promoTypeId: string | null;
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
  cardCount: number;
  printingCount: number;
}

export interface MarketplaceGroupResponse {
  marketplace: string;
  groupId: number;
  name: string | null;
  abbreviation: string | null;
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

export interface PromoTypeResponse {
  id: string;
  slug: string;
  label: string;
  createdAt: string;
  updatedAt: string;
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

export interface IgnoredProductResponse {
  marketplace: string;
  externalId: number;
  finish: string;
  language: string;
  productName: string;
  createdAt: string;
}

// ── Image rehosting response types ──────────────────────────────────────────

export interface RehostImageResponse {
  total: number;
  rehosted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface RegenerateImageResponse {
  total: number;
  regenerated: number;
  failed: number;
  errors: string[];
  hasMore: boolean;
  totalFiles: number;
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

export interface RenameImagesResponse {
  scanned: number;
  renamed: number;
  alreadyCorrect: number;
  failed: number;
  errors: string[];
  hasMore: boolean;
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
    snapshots: PriceRefreshUpsertCounts;
    staging: PriceRefreshUpsertCounts;
  };
}

export interface ClearPricesResponse {
  marketplace: string;
  deleted: { snapshots: number; products: number; staging: number };
}

// ── Unified marketplace mappings response types ─────────────────────────────

export interface MappingPrintingResponse {
  printingId: string;
  shortCode: string;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  promoTypeSlug: string | null;
  finish: string;
  language: string;
  collectorNumber: number;
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
  language: string;
  marketCents: number;
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
  };
  cardmarket: {
    stagedProducts: StagedProductResponse[];
    assignedProducts: StagedProductResponse[];
  };
  cardtrader: {
    stagedProducts: StagedProductResponse[];
    assignedProducts: StagedProductResponse[];
  };
}

export interface AssignableCardResponse {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  printings: {
    printingId: string;
    shortCode: string;
    finish: string;
    language: string;
    collectorNumber: number;
    isSigned: boolean;
    externalId: number | null;
  }[];
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
