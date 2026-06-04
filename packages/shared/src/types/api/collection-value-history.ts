export interface CollectionValueHistoryPoint {
  date: string;
  /** Collection value at this point, in integer cents. */
  valueCents: number;
  copyCount: number;
}

export interface CollectionValueHistoryResponse {
  series: CollectionValueHistoryPoint[];
}
