import type { CompiledQuery, DatabaseConnection, Driver, QueryResult } from "kysely";
import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";

import type { Database } from "../db/index.js";

export type StubResult =
  | Record<string, unknown>[]
  | { rows?: Record<string, unknown>[]; numAffectedRows?: bigint }
  | Error;

export interface RecordingDb {
  db: Kysely<Database>;
  statements: CompiledQuery[];
  queries: string[];
  parameters: readonly unknown[][];
  events: string[];
  setRows: (rows: readonly unknown[]) => void;
  reset: () => void;
}

/**
 * `results` is consumed in order; statements past the end fall back to `setRows`.
 * Rows go through `CamelCasePlugin`, so write keys in snake_case.
 */
export function createRecordingDb(results: StubResult[] = []): RecordingDb {
  // Callers destructure `queries`/`parameters` immediately, so these must be
  // plain arrays kept in sync, not getters derived from `statements`.
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

/** The single statement recorded so far, with runs of whitespace collapsed. */
export function onlyStatement(recorded: RecordingDb): CompiledQuery {
  const [query] = recorded.statements;
  if (recorded.statements.length !== 1 || !query) {
    throw new Error(`Expected exactly 1 statement, captured ${recorded.statements.length}`);
  }
  return { ...query, sql: query.sql.replaceAll(/\s+/gu, " ").trim() };
}
