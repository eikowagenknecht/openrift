import type { CardType, DeckZone, Domain } from "../enums.js";

export interface DeckListResponse {
  decks: DeckResponse[];
}

export interface DeckAvailabilityResponse {
  availability: DeckAvailabilityItemResponse[];
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
  domains: Domain[];
  energy: number | null;
  might: number | null;
  power: number | null;
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
