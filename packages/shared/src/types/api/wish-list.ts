export interface WishListListResponse {
  items: WishListResponse[];
}

export interface WishListResponse {
  id: string;
  name: string;
  rules: Record<string, string | number | boolean | null> | null;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WishListItemResponse {
  id: string;
  wishListId: string;
  cardId: string | null;
  printingId: string | null;
  quantityDesired: number;
}

export interface WishListDetailResponse {
  wishList: WishListResponse;
  items: WishListItemResponse[];
}
