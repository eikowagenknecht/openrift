import type { CardType, DeckZone, Domain, SuperType } from "../enums.js";

export interface DeckListResponse {
  items: DeckListItemResponse[];
}

/** Slimmed-down deck fields for the list view (no isWanted/isPublic/shareToken/description). */
export interface DeckSummaryResponse {
  id: string;
  name: string;
  format: "constructed" | "freeform";
  isPinned: boolean;
  archivedAt: string | null;
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
  description: string | null;
  format: "constructed" | "freeform";
  isWanted: boolean;
  isPublic: boolean;
  shareToken: string | null;
  isPinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeckCardResponse {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  /** Optional pin to a specific printing for display. Null means "default art". */
  preferredPrintingId: string | null;
}

export interface DeckDetailResponse {
  deck: DeckResponse;
  cards: DeckCardResponse[];
}

/** Deck fields exposed on the public share page — excludes owner-only fields (shareToken, isPublic). */
export interface PublicDeckResponse {
  id: string;
  name: string;
  description: string | null;
  format: "constructed" | "freeform";
  createdAt: string;
  updatedAt: string;
}

/**
 * Denormalized deck card row for the public share page. The public endpoint
 * ships the card's display fields and the preferred/canonical printing's
 * thumbnail + full image URL so the share page can SSR without pulling the
 * global catalog.
 */
export interface PublicDeckCardResponse extends DeckCardResponse {
  cardName: string;
  cardSlug: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  tags: string[];
  keywords: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  /** Resolved printing: the preferred one when set, otherwise the canonical default. Null when the card has no printing. */
  resolvedPrintingId: string | null;
  shortCode: string | null;
  thumbnailUrl: string | null;
  fullImageUrl: string | null;
}

export interface PublicDeckDetailResponse {
  deck: PublicDeckResponse;
  cards: PublicDeckCardResponse[];
  owner: { displayName: string };
}

export interface DeckShareResponse {
  shareToken: string;
  isPublic: boolean;
}

export interface DeckCloneResponse {
  deckId: string;
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
  /** Printing resolved from the imported code, when the format carries printing info. */
  preferredPrintingId: string | null;
}

export interface DeckImportPreviewResponse {
  cards: DeckImportCardPreview[];
  warnings: string[];
}
