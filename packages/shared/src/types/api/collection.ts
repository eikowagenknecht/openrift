export interface CollectionResponse {
  id: string;
  name: string;
  description: string | null;
  availableForDeckbuilding: boolean;
  isInbox: boolean;
  sortOrder: number;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionListResponse {
  items: CollectionResponse[];
}

export interface CopyListResponse {
  items: CopyResponse[];
  nextCursor: string | null;
}

export interface CopyCountResponse {
  items: Record<string, number>;
}

export interface CopyResponse {
  id: string;
  printingId: string;
  collectionId: string;
  acquisitionSourceId: string | null;
  cardId: string;
  setId: string;
  collectorNumber: number;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  finish: string;
  imageUrl: string | null;
  artist: string | null;
  cardName: string;
  cardType: string;
  createdAt: string;
  updatedAt: string;
}
