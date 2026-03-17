import type { CardType, Finish, Rarity } from "../enums.js";

export interface TradeListResponse {
  id: string;
  name: string;
  rules: unknown;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradeListItemResponse {
  id: string;
  tradeListId: string;
  copyId: string;
}

export interface TradeListItemDetailResponse extends TradeListItemResponse {
  printingId: string;
  collectionId: string;
  imageUrl: string | null;
  setId: string;
  collectorNumber: number;
  rarity: Rarity;
  finish: Finish;
  cardName: string;
  cardType: CardType;
}

export interface TradeListDetailResponse {
  tradeList: TradeListResponse;
  items: TradeListItemDetailResponse[];
}
