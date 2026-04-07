import type { CardType, DeckZone, Domain, SuperType } from "../enums.js";

export interface DeckListResponse {
  items: DeckListItemResponse[];
}

/** Slimmed-down deck fields for the list view (no isWanted/isPublic/shareToken/description). */
export interface DeckSummaryResponse {
  id: string;
  name: string;
  format: "standard" | "freeform";
  createdAt: string;
  updatedAt: string;
}

export interface DeckListItemResponse {
  deck: DeckSummaryResponse;
  legendCardId: string | null;
  championCardId: string | null;
  totalCards: number;
  typeCounts: { cardType: CardType; count: number }[];
  domainDistribution: { domain: Domain; count: number }[];
  isValid: boolean;
  totalValueCents: number | null;
}

export interface DeckAvailabilityResponse {
  items: DeckAvailabilityItemResponse[];
}

export interface DeckResponse {
  id: string;
  name: string;
  format: "standard" | "freeform";
}

export interface DeckCardResponse {
  cardId: string;
  zone: DeckZone;
  quantity: number;
}

export interface DeckDetailResponse {
  deck: DeckResponse;
  cards: DeckCardResponse[];
}

export interface DeckAvailabilityItemResponse {
  cardId: string;
  zone: DeckZone;
  needed: number;
  owned: number;
  shortfall: number;
}

export interface DeckExportResponse {
  code: string;
  warnings: string[];
}

export interface DeckImportCardPreview {
  cardId: string;
  shortCode: string;
  zone: DeckZone;
  quantity: number;
  cardName: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
}

export interface DeckImportPreviewResponse {
  cards: DeckImportCardPreview[];
  warnings: string[];
}
