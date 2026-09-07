import { ERROR_CODES, legendDisplayName } from "@openrift/shared";
import type { CardType, Finish, Rarity } from "@openrift/shared/types";
import type {
  Expression,
  ExpressionBuilder,
  Kysely,
  RawBuilder,
  Selectable,
  SelectQueryBuilder,
  SqlBool,
  StringReference,
} from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import type {
  CopiesTable,
  ImageFilesTable,
  PrintingImagesTable,
  PrintingsTable,
} from "../db/tables.js";
import { AppError } from "../errors.js";

/**
 * Resolves the image_files.id for a self-hosted image. NULL when the row
 * hasn't been rehosted yet, so callers can filter `IS NOT NULL` to exclude
 * external-only entries from public pages. The client constructs variant URLs
 * from this ID via `imageUrl()` in shared.
 */
export function imageId(alias: string): RawBuilder<string | null> {
  return sql<
    string | null
  >`CASE WHEN ${sql.ref(`${alias}.rehostedUrl`)} IS NOT NULL THEN ${sql.ref(`${alias}.id`)} ELSE NULL END`;
}

export function fallbackImageId(alias: string) {
  return sql<string | null>`(
    SELECT fbf.id FROM image_files fbf
    WHERE fbf.id = ${sql.ref(`${alias}.fallbackImageFileId`)}
      AND fbf.rehosted_url IS NOT NULL
  )`.as("fallbackImageId");
}

/**
 * Falls back to the original provider URL. Use this only in admin contexts
 * where showing external images is acceptable.
 */
export function imageUrlWithOriginal(alias: string): RawBuilder<string | null> {
  return sql<
    string | null
  >`COALESCE(${sql.ref(`${alias}.rehostedUrl`)}, ${sql.ref(`${alias}.originalUrl`)})`;
}

const CURSOR_SEPARATOR = "_";

/**
 * The matching reader is {@link keysetCursorPredicate}; `keysetCursorSchema`
 * in `@openrift/shared` validates the same grammar at the contract boundary.
 */
export function buildKeysetCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}${CURSOR_SEPARATOR}${id}`;
}

export interface KeysetPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

/**
 * Turns an over-fetched row set into a response page. The repositories fetch
 * `limit + 1` rows so the extra row proves another page exists; this drops it,
 * maps what remains, and builds the next cursor from the last kept row.
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

interface OwnedKeysetRow {
  userId: string;
  createdAt: Date;
  id: string;
}

type OwnedKeysetTable = {
  [K in keyof Database]: Database[K] extends {
    userId: unknown;
    createdAt: unknown;
    id: unknown;
  }
    ? K
    : never;
}[keyof Database];

/**
 * One user's rows from an owner-scoped ledger, newest first and keyset
 * paginated on `(created_at desc, id desc)`. Returns up to `limit + 1` rows so
 * the caller can detect a next page.
 *
 * The internal casts are what let one helper serve every such table: the table
 * name is a runtime value, so the column references cannot be resolved against
 * a specific table at compile time. `OwnedKeysetTable` still keeps the argument
 * from naming a table that lacks the columns.
 */
export async function listOwnedByUser<TRow>(
  db: Kysely<Database>,
  table: OwnedKeysetTable,
  userId: string,
  options: { cursor?: string | null; limit: number },
): Promise<TRow[]> {
  let query = (db as unknown as Kysely<{ owned: OwnedKeysetRow }>)
    .selectFrom(table as "owned")
    .selectAll()
    .where("userId", "=", userId)
    .orderBy("createdAt", "desc")
    .orderBy("id", "desc")
    .limit(options.limit + 1);
  if (options.cursor) {
    query = query.where(
      keysetCursorPredicate(options.cursor, {
        timeColumn: "createdAt",
        idColumn: "id",
        idDirection: "desc",
      }),
    );
  }
  const rows = await query.execute();
  return rows as TRow[];
}

function parseKeysetCursor(cursor: string): { time: Date; id: string | null } {
  const separatorIndex = cursor.indexOf(CURSOR_SEPARATOR);
  // Legacy timestamp-only cursor (backward compat during deploys) has no
  // separator; either way, the part before it (or the whole string) must be
  // a parseable timestamp.
  const rawTime = separatorIndex === -1 ? cursor : cursor.slice(0, separatorIndex);
  const time = new Date(rawTime);
  if (Number.isNaN(time.getTime())) {
    // The query schemas (keysetCursorSchema) already reject syntactically
    // invalid cursors before this runs; this is a defensive backstop against
    // any other caller passing an unvalidated cursor straight through.
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Invalid cursor");
  }
  return {
    time,
    id: separatorIndex === -1 ? null : cursor.slice(separatorIndex + 1),
  };
}

/**
 * Caller's ORDER BY must be `<timeColumn> desc, <idColumn> <idDirection>`.
 * Needs both a `date_trunc('milliseconds', ...)` comparison (the column keeps µs precision a JS `Date` cannot) and a redundant bare-column bound (`date_trunc` is only STABLE, so it alone is not sargable).
 */
export function keysetCursorPredicate(
  cursor: string,
  options: { timeColumn: string; idColumn: string; idDirection: "asc" | "desc" },
): Expression<SqlBool> {
  const { time, id } = parseKeysetCursor(cursor);
  const timeRef = sql.ref(options.timeColumn);
  const truncatedTime = sql<Date>`date_trunc('milliseconds', ${timeRef})`;
  const upperBound = new Date(time.getTime() + 1);
  const sargableBound = sql<SqlBool>`${timeRef} < ${upperBound}`;
  if (id === null) {
    return sql<SqlBool>`(${sargableBound} and ${truncatedTime} < ${time})`;
  }
  const idRef = sql.ref(options.idColumn);
  const tieBreak =
    options.idDirection === "asc" ? sql<SqlBool>`${idRef} > ${id}` : sql<SqlBool>`${idRef} < ${id}`;
  return sql<SqlBool>`(${sargableBound} and (${truncatedTime} < ${time} or (${truncatedTime} = ${time} and ${tieBreak})))`;
}

interface FrontImageTables {
  pi: PrintingImagesTable;
  imgf: ImageFilesTable;
}

/**
 * Left-joins the active front-face image of the `p`-aliased printing, exposing
 * it as `pi` (printing_images) and `imgf` (image_files). Left, not inner, so a
 * printing with no artwork still yields its row — pair it with `imageId("imgf")`
 * to get the nullable image id, or read `imgf.rehostedUrl` directly.
 *
 * The query must already have `printings` (or `printings_ordered`) aliased to
 * `p`; the generic constraint enforces that much, and the internal casts are
 * what let one helper serve every root table. Callers therefore must not
 * already use the `pi` or `imgf` aliases.
 */
export function joinFrontImage<DB extends { p: { id: unknown } }, TB extends keyof DB, O>(
  qb: SelectQueryBuilder<DB, TB, O>,
): SelectQueryBuilder<DB & FrontImageTables, TB | "pi" | "imgf", O> {
  return (qb as unknown as SelectQueryBuilder<Database & { p: PrintingsTable }, "p", O>)
    .leftJoin("printingImages as pi", (join) =>
      join
        .onRef("pi.printingId", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.isActive", "=", true),
    )
    .leftJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId") as unknown as SelectQueryBuilder<
    DB & FrontImageTables,
    TB | "pi" | "imgf",
    O
  >;
}

interface RequiredFrontImageTables {
  pim: PrintingImagesTable;
  imgf: ImageFilesTable;
}

/**
 * Drops rows whose printing has no active front image. Exposes the joins as
 * `pim`/`imgf`; never combine with {@link joinFrontImage} in the same query.
 */
export function requireFrontImage<DB extends Database, TB extends keyof DB, O>(
  qb: SelectQueryBuilder<DB, TB, O>,
  printingIdRef: StringReference<DB, TB>,
): SelectQueryBuilder<DB & RequiredFrontImageTables, TB | "pim" | "imgf", O> {
  return (qb as unknown as SelectQueryBuilder<Database & { src: { printingId: string } }, "src", O>)
    .innerJoin("printingImages as pim", (join) =>
      join
        .onRef("pim.printingId", "=", printingIdRef as never)
        .on("pim.face", "=", "front")
        .on("pim.isActive", "=", true),
    )
    .innerJoin("imageFiles as imgf", "imgf.id", "pim.imageFileId") as unknown as SelectQueryBuilder<
    DB & RequiredFrontImageTables,
    TB | "pim" | "imgf",
    O
  >;
}

/**
 * Requires a **left**-joined `mvCardAggregates as mca`: it is refreshed on demand,
 * and an inner join would drop a fresh card's copies from the query entirely.
 *
 * @returns The aliased `types` column, never null.
 */
export function cardTypesColumn() {
  return sql<CardType[]>`coalesce(mca.types, '{}')`.as("types");
}

export function selectCopyWithCard(db: Kysely<Database>) {
  return joinFrontImage(
    db
      .selectFrom("copies as cp")
      .innerJoin("printings as p", "p.id", "cp.printingId")
      .innerJoin("cards as c", "c.id", "p.cardId")
      .leftJoin("mvCardAggregates as mca", "mca.cardId", "c.id"),
  );
}

export interface PrintingDetail {
  cardName: string;
  setId: string;
  rarity: Rarity;
  finish: Finish;
  shortCode: string;
  language: string;
  imageId: string | null;
}

export async function printingDetailsByIds(
  db: Kysely<Database>,
  ids: string[],
): Promise<Map<string, PrintingDetail>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await joinFrontImage(
    db
      .selectFrom("printings as p")
      .innerJoin("cards as card", "card.id", "p.cardId")
      .leftJoin("mvCardAggregates as mca", "mca.cardId", "card.id"),
  )
    .select([
      "p.id",
      "card.name as name",
      cardTypesColumn(),
      "card.tags as tags",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("imgf").as("imageId"),
    ])
    .where("p.id", "in", ids)
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      {
        cardName: legendDisplayName(row),
        setId: row.setId,
        rarity: row.rarity,
        finish: row.finish,
        shortCode: row.shortCode,
        language: row.language,
        imageId: row.imageId,
      },
    ]),
  );
}

/**
 * Tables whose sharing follows the `share_token`/`is_public`/`user_id` pattern.
 * `collections` is deliberately excluded: it scopes its setter by id alone.
 */
type ShareableTable = "lists" | "decks" | "tierLists";

export interface ShareState {
  shareToken: string | null;
  isPublic: boolean;
}

/*
 * The helpers below cast `table` to one concrete member of ShareableTable;
 * the runtime value still supplies the real table name in the emitted SQL.
 */

/**
 * Returns undefined for "not yours" (404); a row the caller owns but never
 * shared reports `{ shareToken: null, isPublic: false }`, not undefined.
 */
export function selectShareState(
  db: Kysely<Database>,
  table: ShareableTable,
  id: string,
  userId: string,
): Promise<ShareState | undefined> {
  return db
    .selectFrom(table as "lists")
    .select(["shareToken", "isPublic"])
    .where("id", "=", id)
    .where("userId", "=", userId)
    .executeTakeFirst();
}

function shareUpdate(
  db: Kysely<Database>,
  table: ShareableTable,
  id: string,
  userId: string,
  shareToken: string | null,
  isPublic: boolean,
) {
  return db
    .updateTable(table as "lists")
    .set({ shareToken, isPublic })
    .where("id", "=", id)
    .where("userId", "=", userId);
}

/** Revoking must clear `shareToken`, not just `isPublic`, or the old link still resolves. */
export async function updateShareRow<T extends ShareableTable>(
  db: Kysely<Database>,
  table: T,
  id: string,
  userId: string,
  shareToken: string | null,
  isPublic: boolean,
): Promise<Selectable<Database[T]> | undefined> {
  const row = await shareUpdate(db, table, id, userId, shareToken, isPublic)
    .returningAll()
    .executeTakeFirst();
  return row as Selectable<Database[T]> | undefined;
}

export function updateShareState(
  db: Kysely<Database>,
  table: ShareableTable,
  id: string,
  userId: string,
  shareToken: string | null,
  isPublic: boolean,
): Promise<ShareState | undefined> {
  return shareUpdate(db, table, id, userId, shareToken, isPublic)
    .returning(["shareToken", "isPublic"])
    .executeTakeFirst();
}

/**
 * Requires `isPublic` as well as the token, so revoking kills the link even
 * if the token is still on the row.
 */
export async function findByShareToken<T extends ShareableTable>(
  db: Kysely<Database>,
  table: T,
  shareToken: string,
): Promise<
  { row: Selectable<Database[T]>; ownerName: string | null; ownerEmail: string } | undefined
> {
  const found = await db
    .selectFrom(`${table} as s` as "lists as s")
    .innerJoin("users as u", "u.id", "s.userId")
    .selectAll("s")
    .select(["u.name as ownerName", "u.email as ownerEmail"])
    .where("s.shareToken", "=", shareToken)
    .where("s.isPublic", "=", true)
    .executeTakeFirst();

  if (!found) {
    return undefined;
  }

  const { ownerName, ownerEmail, ...row } = found;
  return { row: row as Selectable<Database[T]>, ownerName, ownerEmail };
}

/**
 * WHERE predicate excluding copies pinned to a live outgoing trade: still
 * owned, but committed elsewhere. Correlates on the `cp`-aliased copy, so the
 * query must already have `copies` aliased to `cp`.
 */
export function notReservedByTrade<DB extends { cp: { id: unknown } }, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
): Expression<SqlBool> {
  const scoped = eb as unknown as ExpressionBuilder<Database & { cp: CopiesTable }, "cp">;
  return scoped.not(
    scoped.exists(
      scoped
        .selectFrom("cardTradeCopies as ctc")
        .select("ctc.copyId")
        .whereRef("ctc.copyId", "=", "cp.id"),
    ),
  );
}

/**
 * The {@link notReservedByTrade} twin for loans: a copy out on a live loan is
 * physically absent, so it counts for nothing whatever its collection says.
 * Correlates on the same `cp` alias.
 */
export function notPinnedToLoan<DB extends { cp: { id: unknown } }, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
): Expression<SqlBool> {
  const scoped = eb as unknown as ExpressionBuilder<Database & { cp: CopiesTable }, "cp">;
  return scoped.not(
    scoped.exists(
      scoped.selectFrom("loanCopies as lc").select("lc.copyId").whereRef("lc.copyId", "=", "cp.id"),
    ),
  );
}
