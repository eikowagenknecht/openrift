import type {
  ArtVariant,
  CardFace,
  CardType,
  Domain,
  Finish,
  Rarity,
  SuperType,
} from "../enums.js";

export interface CardSourceResponse {
  id: string;
  source: string;
  name: string;
  type: CardType | null;
  superTypes: SuperType[];
  domains: Domain[];
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
  keywords: string[];
  rulesText: string | null;
  effectText: string | null;
  tags: string[];
  sourceId: string | null;
  sourceEntityId: string;
  extraData: unknown | null;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrintingSourceResponse {
  id: string;
  cardSourceId: string;
  printingId: string | null;
  sourceId: string;
  setId: string | null;
  setName: string | null;
  collectorNumber: number | null;
  rarity: Rarity | null;
  artVariant: ArtVariant | null;
  isSigned: boolean | null;
  promoTypeId: string | null;
  finish: Finish | null;
  artist: string | null;
  publicCode: string | null;
  printedRulesText: string | null;
  printedEffectText: string | null;
  imageUrl: string | null;
  flavorText: string | null;
  sourceEntityId: string;
  extraData: unknown | null;
  groupKey: string;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrintingSourceGroupResponse {
  groupKey: string;
  label: string;
  mostCommonSourceId: string;
  differentiators: {
    setId: string | null;
    collectorNumber: number | null;
    artVariant: string;
    isSigned: boolean;
    promoTypeId: string | null;
    rarity: string;
    finish: string;
  };
  sourceIds: string[];
  matchedPrintingId: string | null;
  candidatePrintingIds: string[];
}

export interface AdminPrintingImageResponse {
  id: string;
  printingId: string;
  face: CardFace;
  source: string;
  originalUrl: string | null;
  rehostedUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CardSourceSummaryResponse {
  cardId: string | null;
  cardSlug: string | null;
  name: string;
  normalizedName: string;
  sourceIds: string[];
  pendingSourceIds: string[];
  candidateSourceIds: string[];
  sourceCount: number;
  uncheckedCardCount: number;
  uncheckedPrintingCount: number;
  hasGallery: boolean;
  releasedSetSlug: string | null;
  hasMissingImage: boolean;
  suggestedCard: { id: string; slug: string; name: string } | null;
  formattedSourceIds: string;
  formattedPendingSourceIds: string;
}

export interface SourceStatsResponse {
  source: string;
  cardCount: number;
  printingCount: number;
  lastUpdated: string;
}

interface CardSourceUploadUpdatedCard {
  name: string;
  sourceId: string | null;
  fields: { field: string; from: unknown; to: unknown }[];
}

export interface CardSourceUploadResponse {
  newCards: number;
  updates: number;
  unchanged: number;
  errors: string[];
  updatedCards: CardSourceUploadUpdatedCard[];
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

export interface PromoTypeResponse {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SourceSettingResponse {
  source: string;
  sortOrder: number;
  isHidden: boolean;
}

export interface IgnoredProductResponse {
  marketplace: string;
  externalId: number;
  finish: string;
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
  source: string;
  updated: number;
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
  sets: RehostStatusSetStats[];
  disk: RehostStatusDiskStats;
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
  source: string;
  deleted: { snapshots: number; sources: number; staging: number };
}

// ── Unified marketplace mappings response types ─────────────────────────────

export interface MappingPrintingResponse {
  printingId: string;
  sourceId: string;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  promoTypeSlug: string | null;
  finish: string;
  collectorNumber: number;
  imageUrl: string | null;
  externalId: number | null;
}

export interface UnifiedMappingPrintingResponse extends Omit<
  MappingPrintingResponse,
  "externalId"
> {
  tcgExternalId: number | null;
  cmExternalId: number | null;
}

export interface StagedProductResponse {
  externalId: number;
  productName: string;
  finish: string;
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
  primarySourceId: string;
  tcgplayer: {
    stagedProducts: StagedProductResponse[];
    assignedProducts: StagedProductResponse[];
  };
  cardmarket: {
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
    sourceId: string;
    finish: string;
    collectorNumber: number;
    isSigned: boolean;
    externalId: number | null;
  }[];
}

export interface UnifiedMappingsResponse {
  groups: UnifiedMappingGroupResponse[];
  unmatchedProducts: {
    tcgplayer: StagedProductResponse[];
    cardmarket: StagedProductResponse[];
  };
  allCards: AssignableCardResponse[];
}
