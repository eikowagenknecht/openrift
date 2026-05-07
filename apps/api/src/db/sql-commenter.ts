import type {
  CompiledQuery,
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
  TransactionSettings,
} from "kysely";

import type { RequestCtx } from "../middleware/otel-context.js";
import { requestCtx } from "../middleware/otel-context.js";

/**
 * sqlcommenter-style key/value encoding. Values are URL-encoded then any
 * single quotes are doubled per the spec, so the result is safe to embed
 * inside a `'...'` SQL comment literal.
 *
 * @returns The escaped value.
 */
function encodeValue(raw: string): string {
  return encodeURIComponent(raw).replaceAll("'", "''");
}

/**
 * Builds a leading SQL comment carrying low-cardinality request attribution.
 * Format: `/* route='...',traceparent='...' *\/ ` (trailing space). pg
 * preserves leading comments in `pg_stat_statements.query` when
 * `pg_stat_statements.track = 'all'` (the default in modern Postgres).
 *
 * @returns The comment string to prepend to the SQL statement.
 */
export function buildSqlComment(ctx: RequestCtx): string {
  const route = encodeValue(ctx.route);
  const traceparent = encodeValue(ctx.traceparent);
  return `/* route='${route}',traceparent='${traceparent}' */ `;
}

/**
 * Wraps an existing dialect so every query executed through Kysely (or any
 * other consumer of the dialect, e.g. better-auth) carries a leading
 * sqlcommenter comment when a `requestCtx` is active. When no context is
 * set (startup work, ad-hoc scripts) queries pass through untouched.
 */
export class CommentingDialect implements Dialect {
  private readonly inner: Dialect;
  constructor(inner: Dialect) {
    this.inner = inner;
  }
  createAdapter(): DialectAdapter {
    return this.inner.createAdapter();
  }
  createDriver(): Driver {
    return new CommentingDriver(this.inner.createDriver());
  }
  // oxlint-disable-next-line typescript/no-explicit-any -- Dialect interface uses any
  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return this.inner.createIntrospector(db);
  }
  createQueryCompiler(): QueryCompiler {
    return this.inner.createQueryCompiler();
  }
}

class CommentingDriver implements Driver {
  private readonly inner: Driver;
  constructor(inner: Driver) {
    this.inner = inner;
  }
  init(): Promise<void> {
    return this.inner.init();
  }
  destroy(): Promise<void> {
    return this.inner.destroy();
  }
  async acquireConnection(): Promise<DatabaseConnection> {
    const conn = await this.inner.acquireConnection();
    return new CommentingConnection(conn);
  }
  releaseConnection(connection: DatabaseConnection): Promise<void> {
    return this.inner.releaseConnection(unwrap(connection));
  }
  beginTransaction(connection: DatabaseConnection, settings: TransactionSettings): Promise<void> {
    return this.inner.beginTransaction(unwrap(connection), settings);
  }
  commitTransaction(connection: DatabaseConnection): Promise<void> {
    return this.inner.commitTransaction(unwrap(connection));
  }
  rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    return this.inner.rollbackTransaction(unwrap(connection));
  }
  savepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    if (!this.inner.savepoint) {
      return Promise.reject(new Error("Driver does not support savepoints"));
    }
    return this.inner.savepoint(unwrap(connection), savepointName, compileQuery);
  }
  rollbackToSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    if (!this.inner.rollbackToSavepoint) {
      return Promise.reject(new Error("Driver does not support savepoints"));
    }
    return this.inner.rollbackToSavepoint(unwrap(connection), savepointName, compileQuery);
  }
  releaseSavepoint(
    connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    if (!this.inner.releaseSavepoint) {
      return Promise.reject(new Error("Driver does not support savepoints"));
    }
    return this.inner.releaseSavepoint(unwrap(connection), savepointName, compileQuery);
  }
}

class CommentingConnection implements DatabaseConnection {
  readonly inner: DatabaseConnection;
  constructor(inner: DatabaseConnection) {
    this.inner = inner;
  }

  executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const ctx = requestCtx.getStore();
    if (!ctx) {
      return this.inner.executeQuery(compiledQuery);
    }
    return this.inner.executeQuery(annotate(ctx, compiledQuery));
  }

  streamQuery<R>(
    compiledQuery: CompiledQuery,
    chunkSize?: number,
  ): AsyncIterableIterator<QueryResult<R>> {
    const ctx = requestCtx.getStore();
    if (!ctx) {
      return this.inner.streamQuery(compiledQuery, chunkSize);
    }
    return this.inner.streamQuery(annotate(ctx, compiledQuery), chunkSize);
  }
}

function annotate(ctx: RequestCtx, compiled: CompiledQuery): CompiledQuery {
  return { ...compiled, sql: buildSqlComment(ctx) + compiled.sql };
}

function unwrap(connection: DatabaseConnection): DatabaseConnection {
  return connection instanceof CommentingConnection ? connection.inner : connection;
}
