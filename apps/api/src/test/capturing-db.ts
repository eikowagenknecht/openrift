import type { CompiledQuery, DatabaseConnection, Dialect } from "kysely";
import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";

import type { Database } from "../db/index.js";

export interface CapturingDb {
  db: Kysely<Database>;
  /** Statements recorded since the last {@link CapturingDb.reset}, oldest first. */
  statements: CompiledQuery[];
  /** Rows the next statements resolve with. */
  setRows: (rows: readonly unknown[]) => void;
  /** Clears recorded statements and the canned rows. */
  reset: () => void;
}

/**
 * A Kysely wired to the same Postgres compiler and `CamelCasePlugin` as the
 * real connection, but backed by a driver that records statements instead of
 * running them.
 *
 * Use this where the *generated SQL* is the thing under test — repositories
 * that build raw SQL from table and column names, for instance. Where only the
 * resolved value matters, `createMockDb` stays the lighter choice.
 *
 * @returns The recording Kysely instance plus its captured statements.
 */
export function createCapturingDb(): CapturingDb {
  const statements: CompiledQuery[] = [];
  let rows: readonly unknown[] = [];

  const connection: DatabaseConnection = {
    executeQuery: <R>(compiledQuery: CompiledQuery<unknown>) => {
      statements.push(compiledQuery);
      return Promise.resolve({ rows: [...rows] as R[] });
    },
    // oxlint-disable-next-line require-yield -- streaming is not supported by this fake
    async *streamQuery() {
      throw new Error("createCapturingDb does not support streaming");
    },
  };

  const noop = () => Promise.resolve();
  const dialect: Dialect = {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => ({
      init: noop,
      acquireConnection: () => Promise.resolve(connection),
      beginTransaction: noop,
      commitTransaction: noop,
      rollbackTransaction: noop,
      releaseConnection: noop,
      destroy: noop,
    }),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  };

  return {
    db: new Kysely<Database>({ dialect, plugins: [new CamelCasePlugin()] }),
    statements,
    setRows(next) {
      rows = next;
    },
    reset() {
      statements.length = 0;
      rows = [];
    },
  };
}

/**
 * The single statement recorded so far, with runs of whitespace collapsed so
 * assertions can be written on one line.
 *
 * @returns The compiled query, its `sql` normalized.
 */
export function onlyStatement(captured: CapturingDb): CompiledQuery {
  if (captured.statements.length !== 1) {
    throw new Error(`Expected exactly 1 statement, captured ${captured.statements.length}`);
  }
  const query = captured.statements[0];
  return { ...query, sql: query.sql.replaceAll(/\s+/gu, " ").trim() };
}
