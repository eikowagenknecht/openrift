export interface CollectionValueHistoryPoint {
  date: string;
  valueCents: number;
  copyCount: number;
}

export interface CollectionValueHistoryResponse {
  series: CollectionValueHistoryPoint[];
}
