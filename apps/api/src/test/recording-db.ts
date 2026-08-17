import type { CompiledQuery, DatabaseConnection, Driver, QueryResult } from "kysely";
import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";

import type { Database } from "../db/index.js";

/**
 * One canned statement result: rows to return, the same plus an affected-row
 * count (what a write without RETURNING reports), or an error to raise instead.
 */
export type StubResult =
  | Record<string, unknown>[]
  | { rows?: Record<string, unknown>[]; numAffectedRows?: bigint }
  | Error;

/** A recording db plus what it observed. */
export interface RecordingDb {
  db: Kysely<Database>;
  /** Compiled statements since the last {@link RecordingDb.reset}, oldest first. */
  statements: CompiledQuery[];
  /** SQL text of every statement, in execution order. */
  queries: string[];
  /** Bound parameters of every statement, aligned with {@link RecordingDb.queries}. */
  parameters: readonly unknown[][];
  /** Transaction boundaries the driver saw: `begin`, `commit`, `rollback`. */
  events: string[];
  /**
   * Rows every statement resolves with once the scripted results are used up.
   * Use this when a whole test only needs one shared rowset.
   */
  setRows: (rows: readonly unknown[]) => void;
  /** Clears the recorded statements, parameters, events, and the shared rows. */
  reset: () => void;
}

/**
 * A Kysely wired to the same Postgres compiler and `CamelCasePlugin` as the
 * real connection, but backed by a driver that records statements instead of
 * running them. Two ways to feed it results, usable together:
 *
 * - **Scripted**, one entry per statement via the `results` argument. Use this
 *   when the statements differ, when a write's affected-row count decides a
 *   branch, or when one statement has to fail.
 * - **Shared**, one rowset for everything via {@link RecordingDb.setRows}. Use
 *   this when the *generated SQL* is what's under test and the rows are
 *   incidental — repositories that build raw SQL from table and column names,
 *   for instance. Pairs with {@link onlyStatement}.
 *
 * Scripted results are consumed first, in order; every statement past the end
 * of the list falls back to the shared rows (empty unless `setRows` was called).
 *
 * Reach for `createMockDb` instead where only the resolved value matters: it
 * chains every call and never compiles SQL, so it is lighter, but it also
 * cannot tell a transaction from a bare statement and so cannot express
 * atomicity. This one can — it shows which statements ran, whether they ran
 * inside one transaction, and whether a failure rolled that transaction back.
 *
 * Rows are returned through the `CamelCasePlugin` production uses, so write
 * them with snake_case keys exactly as PostgreSQL would.
 *
 * @param results One entry per statement, consumed in order; an `Error` entry
 *   makes that statement fail.
 * @returns The db plus everything it recorded.
 */
export function createRecordingDb(results: StubResult[] = []): RecordingDb {
  // Three parallel arrays rather than deriving `queries`/`parameters` from
  // `statements` on read: callers destructure the result, so a getter would
  // hand them one snapshot taken before the first statement ever ran.
  const statements: CompiledQuery[] = [];
  const queries: string[] = [];
  const parameters: unknown[][] = [];
  const events: string[] = [];
  const remaining = [...results];
  let sharedRows: readonly unknown[] = [];

  const connection: DatabaseConnection = {
    executeQuery<R>(compiledQuery: CompiledQuery<unknown>): Promise<QueryResult<R>> {
      statements.push(compiledQuery);
      queries.push(compiledQuery.sql);
      parameters.push([...compiledQuery.parameters]);
      const next = remaining.shift();
      // The stub cannot know each caller's row shape; the canned rows are the
      // contract, so hand them back under the requested one.
      if (next === undefined) {
        return Promise.resolve({ rows: [...sharedRows] as R[] });
      }
      if (next instanceof Error) {
        return Promise.reject(next);
      }
      const shaped = Array.isArray(next) ? { rows: next } : next;
      return Promise.resolve({
        rows: (shaped.rows ?? []) as R[],
        ...(shaped.numAffectedRows === undefined
          ? {}
          : { numAffectedRows: shaped.numAffectedRows }),
      });
    },
    // oxlint-disable-next-line require-yield -- streaming is never exercised here
    async *streamQuery() {
      throw new Error("streamQuery is not supported by the recording db");
    },
  };

  const driver: Driver = {
    init: () => Promise.resolve(),
    acquireConnection: () => Promise.resolve(connection),
    beginTransaction: () => {
      events.push("begin");
      return Promise.resolve();
    },
    commitTransaction: () => {
      events.push("commit");
      return Promise.resolve();
    },
    rollbackTransaction: () => {
      events.push("rollback");
      return Promise.resolve();
    },
    releaseConnection: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  };

  const db = new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });

  return {
    db,
    statements,
    queries,
    parameters,
    events,
    setRows(next) {
      sharedRows = next;
    },
    // Emptied in place, never reassigned: a destructured `const { queries }`
    // has to keep seeing the statements that follow the reset.
    reset() {
      statements.length = 0;
      queries.length = 0;
      parameters.length = 0;
      events.length = 0;
      sharedRows = [];
    },
  };
}

/**
 * The single statement recorded so far, with runs of whitespace collapsed so
 * assertions can be written on one line.
 *
 * @param recorded The recording db to read.
 * @returns The compiled query, its `sql` normalized.
 * @throws {Error} When the count of recorded statements is not exactly one.
 */
export function onlyStatement(recorded: RecordingDb): CompiledQuery {
  if (recorded.statements.length !== 1) {
    throw new Error(`Expected exactly 1 statement, captured ${recorded.statements.length}`);
  }
  const query = recorded.statements[0];
  return { ...query, sql: query.sql.replaceAll(/\s+/gu, " ").trim() };
}
