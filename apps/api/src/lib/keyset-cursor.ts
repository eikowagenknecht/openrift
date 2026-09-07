import { ERROR_CODES } from "@openrift/shared/error-codes";

import { AppError } from "../errors.js";

const CURSOR_SEPARATOR = "_";

/**
 * `keysetCursorPredicate` in `repositories/query-helpers.ts` is the matching
 * reader; `keysetCursorSchema` in `@openrift/shared` validates the same grammar.
 */
export function buildKeysetCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}${CURSOR_SEPARATOR}${id}`;
}

export function parseKeysetCursor(cursor: string): { time: Date; id: string | null } {
  const separatorIndex = cursor.indexOf(CURSOR_SEPARATOR);
  // Legacy timestamp-only cursor (backward compat during deploys) has no
  // separator; either way, the leading part must be a parseable timestamp.
  const rawTime = separatorIndex === -1 ? cursor : cursor.slice(0, separatorIndex);
  const time = new Date(rawTime);
  if (Number.isNaN(time.getTime())) {
    // keysetCursorSchema already rejects invalid cursors before this runs;
    // this is a backstop for any caller passing one through unvalidated.
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Invalid cursor");
  }
  return {
    time,
    id: separatorIndex === -1 ? null : cursor.slice(separatorIndex + 1),
  };
}

export interface KeysetPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

/**
 * Repositories fetch `limit + 1` rows so the extra proves another page
 * exists; this drops it and builds the next cursor from the last kept row.
 */
export function keysetPage<TRow extends { createdAt: Date; id: string }, TItem>(
  rows: TRow[],
  limit: number,
  toItem: (row: TRow) => TItem,
): KeysetPage<TItem> {
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => toItem(row)),
    nextCursor: hasMore && last ? buildKeysetCursor(last.createdAt, last.id) : null,
  };
}
