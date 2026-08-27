import { ERROR_CODES } from "@openrift/shared";
import type { Finish, Rarity } from "@openrift/shared/types";
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

/**
 * The same rule as {@link imageId}, applied to a printing's pinned fallback
 * art one join away: NULL unless something is pinned *and* that file has been
 * rehosted. A correlated subquery rather than a join, because the five queries
 * that build a catalog printing row select from a shared column list and would
 * each have to carry the join otherwise. It is a primary-key lookup on a
 * column that is NULL for all but a handful of printings.
 */
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
 * WHERE predicate that resumes a keyset-paginated list after `cursor`. The
 * caller's ORDER BY must be `<timeColumn> desc, <idColumn> <idDirection>` —
 * the tie-break comparator follows `idDirection`, so the two orderings in use
 * (events page id-descending, copies id-ascending) stay explicit rather than
 * drifting apart.
 *
 * The predicate has two parts, and both are needed.
 *
 * The correctness half compares through `date_trunc('milliseconds', ...)`: the
 * column keeps µs precision that a JS `Date` cannot carry, so an untruncated
 * equality would silently skip the rows sharing the cursor's millisecond.
 *
 * The performance half is the redundant `<timeColumn> < cursorTime + 1ms`
 * bound. `date_trunc` is only STABLE, so no index can serve the truncated
 * comparison and the planner falls back to scanning the table. The bare column
 * bound is sargable, so an index on `(timeColumn, idColumn)` can seek. It
 * excludes nothing: the cursor time is millisecond-aligned (it comes from a JS
 * `Date`), every row passing the truncated half satisfies
 * `date_trunc(col) <= cursorTime`, and that is equivalent to
 * `col < cursorTime + 1ms`.
 */
export function keysetCursorPredicate(
  cursor: string,
  options: { timeColumn: string; idColumn: string; idDirection: "asc" | "desc" },
): Expression<SqlBool> {
  const { time, id } = parseKeysetCursor(cursor);
  const timeRef = sql.ref(options.timeColumn);
  const truncatedTime = sql<Date>`date_trunc('milliseconds', ${timeRef})`;
  // Exclusive upper bound: the cursor's millisecond plus one, so every µs
  // inside the cursor's own millisecond still passes and the truncated half
  // stays the only thing deciding those rows.
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
 * Inner-join variant of {@link joinFrontImage}: takes the printing id from an
 * explicit reference instead of a `p` alias, and drops rows whose printing has
 * no active front image. Use it where an imageless printing must not surface at
 * all — cover fans and thumb stacks, where a blank tile would waste a slot.
 *
 * Exposes the joins as `pim` and `imgf`, so a query can carry this or
 * `joinFrontImage`, never both.
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

export function selectCopyWithCard(db: Kysely<Database>) {
  return joinFrontImage(
    db
      .selectFrom("copies as cp")
      .innerJoin("printings as p", "p.id", "cp.printingId")
      .innerJoin("cards as c", "c.id", "p.cardId"),
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
    db.selectFrom("printings as p").innerJoin("cards as card", "card.id", "p.cardId"),
  )
    .select([
      "p.id",
      "card.name as cardName",
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
        cardName: row.cardName,
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
 * The tables whose sharing follows the deck pattern: a `share_token` column
 * armed by an `is_public` flag, owned through a non-null `user_id`, and
 * revoked by nulling both. `collections` deliberately isn't one of them — it
 * touches `updated_at` on every share write, scopes its setter by id alone
 * (group admins share collections they don't own), and its public lookup can
 * take the owner label from a friend group instead of a user.
 */
type ShareableTable = "lists" | "decks" | "tierLists";

export interface ShareState {
  shareToken: string | null;
  isPublic: boolean;
}

/*
 * The four helpers below pin their query builder to one concrete table
 * (`table as "lists"`) while the runtime value of `table` supplies the real
 * name in the emitted SQL. Every ShareableTable carries the same four columns
 * with the same types, so the pinned shape describes all of them; the two
 * row-returning helpers cast the result back to the caller's own table.
 */

/**
 * Reads the share state of a row the caller owns. A row that exists but has
 * never been shared reports `{ shareToken: null, isPublic: false }`, which is
 * what lets a route tell "not yours" (undefined, so 404) apart from "yours,
 * not shared yet".
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

/**
 * Sets (or nulls) the share token and public flag on a row the caller owns.
 * `is_public=true` with a token means "shareable by link"; null + false means
 * private, and clearing the token as well is what stops a revoked link from
 * ever coming back to life.
 */
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

/**
 * {@link updateShareRow} for a caller that only needs to know the write landed:
 * returns the two share columns instead of the whole row, so a big jsonb
 * payload never rides back on an unshare.
 */
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
 * Resolves a public share token to its row plus the owner's identity.
 * Anonymous, with no user scoping, but `is_public` is required as well as the
 * token, so revoking sharing kills the link even while the token is still on
 * the row. The owner's email is carried for gravatar derivation and never
 * reaches a response on its own.
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
