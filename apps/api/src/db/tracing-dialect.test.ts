import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { CompiledQuery, DatabaseConnection, Driver } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TracingDialect } from "./tracing-dialect.js";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(contextManager.enable());
});

afterAll(async () => {
  contextManager.disable();
  await provider.shutdown();
  trace.disable();
  context.disable();
});

afterEach(() => {
  exporter.reset();
});

function makeCompiled(sql: string): CompiledQuery {
  return {
    sql,
    parameters: [],
    query: { kind: "SelectQueryNode" } as CompiledQuery["query"],
    queryId: { queryId: sql },
  };
}

function fakeDriver(executeQuery: DatabaseConnection["executeQuery"]): Driver {
  const connection: DatabaseConnection = {
    executeQuery,
    streamQuery: () => {
      throw new Error("not implemented");
    },
  };
  return {
    init: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
    acquireConnection: () => Promise.resolve(connection),
    releaseConnection: () => Promise.resolve(),
    beginTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
  };
}

function dialectFor(driver: Driver): TracingDialect {
  return new TracingDialect({
    createAdapter: () => ({}) as never,
    createDriver: () => driver,
    createIntrospector: () => ({}) as never,
    createQueryCompiler: () => ({}) as never,
  });
}

function spansByName(spans: ReadableSpan[]): Record<string, ReadableSpan> {
  const byName: Record<string, ReadableSpan> = {};
  for (const span of spans) {
    byName[span.name] = span;
  }
  return byName;
}

describe("TracingDialect", () => {
  it("emits a db.query span with statement and system attributes", async () => {
    const dialect = dialectFor(fakeDriver(async () => ({ rows: [] })));
    const conn = await dialect.createDriver().acquireConnection();
    await conn.executeQuery(makeCompiled("SELECT 1"));

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("db.select");
    expect(spans[0]?.attributes).toMatchObject({
      "db.system.name": "postgresql",
      "db.query.text": "SELECT 1",
    });
  });

  it("nests db.query under the active parent span", async () => {
    const dialect = dialectFor(fakeDriver(async () => ({ rows: [] })));
    const conn = await dialect.createDriver().acquireConnection();

    const tracer = trace.getTracer("test");
    const parent = tracer.startSpan("parent");
    await context.with(trace.setSpan(context.active(), parent), () =>
      conn.executeQuery(makeCompiled("UPDATE cards SET name=$1")),
    );
    parent.end();

    const byName = spansByName(exporter.getFinishedSpans());
    expect(byName["db.update"]).toBeDefined();
    expect(byName["db.update"]?.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
  });

  it("marks the span as ERROR when the query throws", async () => {
    const dialect = dialectFor(
      fakeDriver(async () => {
        throw new Error("boom");
      }),
    );
    const conn = await dialect.createDriver().acquireConnection();

    await expect(conn.executeQuery(makeCompiled("SELECT 1"))).rejects.toThrow("boom");

    const spans = exporter.getFinishedSpans();
    expect(spans[0]?.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(spans[0]?.status.message).toBe("boom");
  });

  it("truncates very long statements so spans stay under exporter limits", async () => {
    const huge = `SELECT ${"x".repeat(5000)}`;
    const dialect = dialectFor(fakeDriver(async () => ({ rows: [] })));
    const conn = await dialect.createDriver().acquireConnection();
    await conn.executeQuery(makeCompiled(huge));

    const recorded = exporter.getFinishedSpans()[0]?.attributes["db.query.text"];
    expect(typeof recorded).toBe("string");
    expect((recorded as string).length).toBeLessThanOrEqual(2049); // 2048 + ellipsis
    expect((recorded as string).endsWith("…")).toBe(true);
  });

  it("unwraps connections when delegating transaction lifecycle calls", async () => {
    const beginTransaction = vi.fn(async (..._args: Parameters<Driver["beginTransaction"]>) => {});
    const releaseConnection = vi.fn(
      async (..._args: Parameters<Driver["releaseConnection"]>) => {},
    );
    const innerConn: DatabaseConnection = {
      executeQuery: async () => ({ rows: [] }),
      streamQuery: () => {
        throw new Error("not implemented");
      },
    };
    const innerDriver: Driver = {
      init: () => Promise.resolve(),
      destroy: () => Promise.resolve(),
      acquireConnection: () => Promise.resolve(innerConn),
      releaseConnection,
      beginTransaction,
      commitTransaction: () => Promise.resolve(),
      rollbackTransaction: () => Promise.resolve(),
    };
    const dialect = dialectFor(innerDriver);
    const driver = dialect.createDriver();
    const wrappedConn = await driver.acquireConnection();

    await driver.beginTransaction(wrappedConn, {});
    await driver.releaseConnection(wrappedConn);

    expect(beginTransaction.mock.calls[0]?.[0]).toBe(innerConn);
    expect(releaseConnection.mock.calls[0]?.[0]).toBe(innerConn);
  });
});
