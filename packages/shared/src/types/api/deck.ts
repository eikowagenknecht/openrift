import type { CardType, DeckZone, Domain, SuperType } from "../enums.js";

export interface DeckListResponse {
  items: DeckListItemResponse[];
}

export interface DeckListItemResponse {
  deck: DeckResponse;
  legend: { cardName: string; imageUrl: string | null; domains: Domain[] } | null;
  champion: { cardName: string; imageUrl: string | null } | null;
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
  description: string | null;
  format: "standard" | "freeform";
  isWanted: boolean;
  isPublic: boolean;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeckCardResponse {
  id: string;
  deckId: string;
  cardId: string;
  zone: DeckZone;
  quantity: number;
  cardName: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  tags: string[];
  keywords: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  imageUrl: string | null;
}

export interface DeckDetailResponse {
  deck: DeckResponse;
  cards: DeckCardResponse[];
  totalValueCents: number | null;
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
