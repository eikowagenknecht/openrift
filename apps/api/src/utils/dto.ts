import type {
  Collection,
  CopyRow,
  Deck,
  Source,
  TradeList,
  TradeListItem,
  WishList,
  WishListItem,
} from "@openrift/shared";

function snakeToCamel(s: string): string {
  return s.replaceAll(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const TIMESTAMPS = ["created_at", "updated_at"];

function rowToDto<T>(row: object, dateFields: string[] = []): T {
  const dateSet = new Set(dateFields);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = snakeToCamel(key);
    result[camelKey] = dateSet.has(key) ? (value as Date).toISOString() : value;
  }
  return result as T;
}

export const toCollection = (row: object): Collection => rowToDto<Collection>(row, TIMESTAMPS);

export const toDeck = (row: object): Deck => rowToDto<Deck>(row, TIMESTAMPS);

export const toSource = (row: object): Source => rowToDto<Source>(row, TIMESTAMPS);

export const toTradeList = (row: object): TradeList => rowToDto<TradeList>(row, TIMESTAMPS);

export const toTradeListItem = (row: object): TradeListItem => rowToDto<TradeListItem>(row);

export const toWishList = (row: object): WishList => rowToDto<WishList>(row, TIMESTAMPS);

export const toWishListItem = (row: object): WishListItem => rowToDto<WishListItem>(row);

export const toCopy = (row: object): CopyRow => rowToDto<CopyRow>(row, TIMESTAMPS);
