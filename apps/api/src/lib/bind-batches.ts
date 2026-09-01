/**
 * Splitting a write that binds more parameters than one statement can carry.
 *
 * postgres.js refuses a statement binding more than 65534 parameters, so any
 * write whose row count comes from outside the request (a crawl page, a whole
 * event's field, an uncapped admin body) has to be split. The failure is
 * silent until the day the input is big enough, and then it is total: the
 * statement never reaches postgres.
 */

/** What postgres.js binds before it throws `MAX_PARAMETERS_EXCEEDED`. */
export const MAX_BIND_PARAMETERS = 65_534;

/**
 * The share of the ceiling one statement's rows may use. The rest covers what
 * a statement binds outside them: `where` predicates, `on conflict` literals,
 * and the values a `returning` clause has no part in.
 */
const ROW_PARAMETER_BUDGET = 60_000;

/** Rows per batch for a list bound one parameter each, as an `in` list is. */
const KEY_BATCH_SIZE = 1000;

function batchesOf<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/**
 * How many parameters one row of this insert binds. Kysely builds the column
 * list from the union of the rows' keys and binds every column for every row,
 * skipping only a key whose value is `undefined` everywhere (that column is
 * never named at all).
 */
function boundColumns(rows: readonly object[]): number {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      if (value !== undefined) {
        columns.add(column);
      }
    }
  }
  return columns.size;
}

/**
 * Insert rows split into batches no statement can overrun, sized from the
 * columns the rows themselves bind. An empty list yields no batches, so a
 * caller's loop is its own "nothing to write" guard.
 *
 * Batching costs the write its single-statement atomicity unless the caller
 * runs the batches inside a transaction, which is where a wholesale replace
 * belongs anyway.
 */
export function rowBatches<T extends object>(rows: readonly T[]): T[][] {
  const columns = boundColumns(rows);
  if (columns === 0) {
    return rows.length === 0 ? [] : [[...rows]];
  }
  return batchesOf(rows, Math.max(1, Math.floor(ROW_PARAMETER_BUDGET / columns)));
}

/**
 * A key list split into batches, for a query that binds one parameter per key.
 * The caller concatenates the results: batching a read means one query per
 * batch, and the rows come back per batch with them.
 */
export function keyBatches<T>(keys: readonly T[]): T[][] {
  return batchesOf(keys, KEY_BATCH_SIZE);
}
