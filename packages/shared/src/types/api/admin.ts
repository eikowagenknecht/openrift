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
  type: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
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
  collectorNumber: number;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  promoTypeId: string | null;
  finish: Finish;
  artist: string;
  publicCode: string;
  printedRulesText: string | null;
  printedEffectText: string | null;
  imageUrl: string | null;
  flavorText: string | null;
  sourceEntityId: string;
  extraData: unknown | null;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  hasMissingImage: boolean;
  suggestedCard: { id: string; slug: string; name: string } | null;
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

export interface IgnoredProductResponse {
  marketplace: string;
  externalId: number;
  finish: string;
  productName: string;
  createdAt: string;
}
