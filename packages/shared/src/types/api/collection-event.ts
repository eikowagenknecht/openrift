import type { ActivityAction, CardType, Rarity } from "../enums.js";

export interface CollectionEventResponse {
  id: string;
  action: ActivityAction;
  copyId: string | null;
  printingId: string;
  fromCollectionId: string | null;
  fromCollectionName: string | null;
  toCollectionId: string | null;
  toCollectionName: string | null;
  createdAt: string;
  shortCode: string;
  rarity: Rarity;
  imageId: string | null;
  cardName: string;
  cardType: CardType;
  cardSuperTypes: string[];
}

export interface CollectionEventListResponse {
  items: CollectionEventResponse[];
  nextCursor: string | null;
}
