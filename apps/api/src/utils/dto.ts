import type {
  Activity,
  Collection,
  CopyRow,
  Deck,
  Source,
  TradeList,
  TradeListItem,
  WishList,
  WishListItem,
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

export const toCollection = (row: object): Collection =>
  serializeDates<Collection>(row as Record<string, unknown>, TIMESTAMPS);

export const toDeck = (row: object): Deck =>
  serializeDates<Deck>(row as Record<string, unknown>, TIMESTAMPS);

export const toSource = (row: object): Source =>
  serializeDates<Source>(row as Record<string, unknown>, TIMESTAMPS);

export const toTradeList = (row: object): TradeList =>
  serializeDates<TradeList>(row as Record<string, unknown>, TIMESTAMPS);

export const toTradeListItem = (row: object): TradeListItem =>
  serializeDates<TradeListItem>(row as Record<string, unknown>, TIMESTAMPS);

export const toWishList = (row: object): WishList =>
  serializeDates<WishList>(row as Record<string, unknown>, TIMESTAMPS);

export const toWishListItem = (row: object): WishListItem =>
  serializeDates<WishListItem>(row as Record<string, unknown>, TIMESTAMPS);

export const toCopy = (row: object): CopyRow =>
  serializeDates<CopyRow>(row as Record<string, unknown>, TIMESTAMPS);

export function toActivity(row: Selectable<ActivitiesTable>): Activity {
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
