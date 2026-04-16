export interface CollectionResponse {
  id: string;
  name: string;
  description: string | null;
  availableForDeckbuilding: boolean;
  isInbox: boolean;
  sortOrder: number;
  shareToken: string | null;
  copyCount: number;
  totalValueCents: number | null;
  unpricedCopyCount: number | null;
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

export interface CopyCollectionBreakdownEntry {
  collectionId: string;
  collectionName: string;
  count: number;
}

export interface CopyResponse {
  id: string;
  printingId: string;
  collectionId: string;
}
