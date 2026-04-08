import type { CardType, Finish, Rarity } from "../enums.js";

export interface TradeListListResponse {
  items: TradeListResponse[];
}

export interface TradeListResponse {
  id: string;
  name: string;
  rules: Record<string, string | number | boolean | null> | null;
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
  rarity: Rarity;
  finish: Finish;
  cardName: string;
  cardType: CardType;
}

export interface TradeListDetailResponse {
  tradeList: TradeListResponse;
  items: TradeListItemDetailResponse[];
}
