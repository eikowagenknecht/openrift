export interface CollectionValueHistoryPoint {
  date: string;
  value: number;
  copyCount: number;
}

export interface CollectionValueHistoryResponse {
  series: CollectionValueHistoryPoint[];
}
