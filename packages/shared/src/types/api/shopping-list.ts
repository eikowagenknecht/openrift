export interface ShoppingListSourceResponse {
  source: string;
  sourceId: string;
  sourceName: string;
  needed: number;
}

export interface ShoppingListItemResponse {
  cardId: string | null;
  printingId: string | null;
  totalDemand: number;
  owned: number;
  stillNeeded: number;
  sources: ShoppingListSourceResponse[];
}

export interface ShoppingListResponse {
  items: ShoppingListItemResponse[];
}
