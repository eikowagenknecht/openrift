import type {
  ActivityResponse,
  CollectionResponse,
  CopyResponse,
  DeckResponse,
  SourceResponse,
  TradeListResponse,
  TradeListItemResponse,
  WishListResponse,
  WishListItemResponse,
} from "@openrift/shared";
import { formatDateUTC } from "@openrift/shared";
import { activityTypeSchema } from "@openrift/shared/schemas";
import type { Selectable } from "kysely";

import type { ActivitiesTable } from "../db/index.js";

/**
 * Serialize Date fields to ISO strings. Keys are already camelCase (CamelCasePlugin).
 * @returns The row with Date fields converted to ISO strings.
 */
function serializeDates<T>(row: Record<string, unknown>, dateFields: string[]): T {
  const result = { ...row };
  for (const key of dateFields) {
    if (result[key] instanceof Date) {
      result[key] = (result[key] as Date).toISOString();
    }
  }
  return result as T;
}

const TIMESTAMPS = ["createdAt", "updatedAt"];

export const toCollection = (row: object): CollectionResponse =>
  serializeDates<CollectionResponse>(row as Record<string, unknown>, TIMESTAMPS);

export const toDeck = (row: object): DeckResponse =>
  serializeDates<DeckResponse>(row as Record<string, unknown>, TIMESTAMPS);

export const toSource = (row: object): SourceResponse =>
  serializeDates<SourceResponse>(row as Record<string, unknown>, TIMESTAMPS);

export const toTradeList = (row: object): TradeListResponse =>
  serializeDates<TradeListResponse>(row as Record<string, unknown>, TIMESTAMPS);

export const toTradeListItem = (row: object): TradeListItemResponse =>
  serializeDates<TradeListItemResponse>(row as Record<string, unknown>, TIMESTAMPS);

export const toWishList = (row: object): WishListResponse =>
  serializeDates<WishListResponse>(row as Record<string, unknown>, TIMESTAMPS);

export const toWishListItem = (row: object): WishListItemResponse =>
  serializeDates<WishListItemResponse>(row as Record<string, unknown>, TIMESTAMPS);

export const toCopy = (row: object): CopyResponse =>
  serializeDates<CopyResponse>(row as Record<string, unknown>, TIMESTAMPS);

export function toActivity(row: Selectable<ActivitiesTable>): ActivityResponse {
  return {
    id: row.id,
    type: activityTypeSchema.parse(row.type),
    name: row.name,
    date: formatDateUTC(row.date),
    description: row.description,
    isAuto: row.isAuto,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
