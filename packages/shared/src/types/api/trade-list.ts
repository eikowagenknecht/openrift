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
