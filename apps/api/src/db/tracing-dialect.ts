import { recordSpanError } from "@openrift/shared/otel";
import { context, SpanKind, trace } from "@opentelemetry/api";
import {
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  DB_SYSTEM_NAME_VALUE_POSTGRESQL,
} from "@opentelemetry/semantic-conventions";
import type {
  AbortableOperationOptions,
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

const tracer = trace.getTracer("openrift-api/db");

/** Truncate large SQL bodies so individual spans stay under exporter limits. */
const MAX_STATEMENT_LENGTH = 2048;

/**
 * Strip leading whitespace and grab the first SQL keyword for the span name.
 *
 * @returns A short low-cardinality span name like "db.select" or "db.update".
 */
function deriveSpanName(sql: string): string {
  const trimmed = sql.trimStart();
  const firstWord = trimmed.split(/\s+/u, 1)[0]?.toUpperCase() ?? "QUERY";
  return `db.${firstWord.toLowerCase()}`;
}

function truncate(sql: string): string {
  return sql.length > MAX_STATEMENT_LENGTH ? `${sql.slice(0, MAX_STATEMENT_LENGTH)}…` : sql;
}

/**
 * Wraps a Kysely Dialect so every `executeQuery` / `streamQuery` is
 * surrounded by an OTel `db.query` span. The span automatically inherits
 * the active OTel context as its parent, which is the `http.server` span
 * opened by the Hono request middleware (or the cron span opened by
 * runJob), so traces show route → query relationships end-to-end.
 */
export class TracingDialect implements Dialect {
  private readonly inner: Dialect;
  constructor(inner: Dialect) {
    this.inner = inner;
  }
  createAdapter(): DialectAdapter {
    return this.inner.createAdapter();
  }
  createDriver(): Driver {
    return new TracingDriver(this.inner.createDriver());
  }
  // oxlint-disable-next-line typescript/no-explicit-any -- Dialect interface uses any
  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return this.inner.createIntrospector(db);
  }
  createQueryCompiler(): QueryCompiler {
    return this.inner.createQueryCompiler();
  }
}

class TracingDriver implements Driver {
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
    return new TracingConnection(conn);
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

class TracingConnection implements DatabaseConnection {
  readonly inner: DatabaseConnection;
  constructor(inner: DatabaseConnection) {
    this.inner = inner;
  }

  async executeQuery<R>(
    compiledQuery: CompiledQuery,
    options?: AbortableOperationOptions,
  ): Promise<QueryResult<R>> {
    const span = tracer.startSpan(deriveSpanName(compiledQuery.sql), {
      kind: SpanKind.CLIENT,
      attributes: {
        [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_POSTGRESQL,
        [ATTR_DB_QUERY_TEXT]: truncate(compiledQuery.sql),
      },
    });
    try {
      return await context.with(trace.setSpan(context.active(), span), () =>
        this.inner.executeQuery<R>(compiledQuery, options),
      );
    } catch (error) {
      recordSpanError(span, error);
      throw error;
    } finally {
      span.end();
    }
  }

  streamQuery<R>(
    compiledQuery: CompiledQuery,
    chunkSize: number,
    options?: AbortableOperationOptions,
  ): AsyncIterableIterator<QueryResult<R>> {
    const span = tracer.startSpan(deriveSpanName(compiledQuery.sql), {
      kind: SpanKind.CLIENT,
      attributes: {
        [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_POSTGRESQL,
        [ATTR_DB_QUERY_TEXT]: truncate(compiledQuery.sql),
      },
    });
    const iter = context.with(trace.setSpan(context.active(), span), () =>
      this.inner.streamQuery<R>(compiledQuery, chunkSize, options),
    );
    return wrapIteratorWithSpan(iter, span);
  }
}

async function* wrapIteratorWithSpan<R>(
  iter: AsyncIterableIterator<QueryResult<R>>,
  span: ReturnType<typeof tracer.startSpan>,
): AsyncIterableIterator<QueryResult<R>> {
  try {
    yield* iter;
  } catch (error) {
    recordSpanError(span, error);
    throw error;
  } finally {
    span.end();
  }
}

function unwrap(connection: DatabaseConnection): DatabaseConnection {
  return connection instanceof TracingConnection ? connection.inner : connection;
}
