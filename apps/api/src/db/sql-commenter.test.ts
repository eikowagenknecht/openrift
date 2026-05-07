import type { CompiledQuery, DatabaseConnection, Driver, QueryResult } from "kysely";
import { describe, expect, it, vi } from "vitest";

import { requestCtx } from "../middleware/otel-context.js";
import { buildSqlComment, CommentingDialect } from "./sql-commenter.js";

function makeCompiled(sql: string): CompiledQuery {
  return { sql, parameters: [], query: { kind: "SelectQueryNode" } as CompiledQuery["query"] };
}

function fakeDialect(executeQuery: DatabaseConnection["executeQuery"]) {
  const connection: DatabaseConnection = {
    executeQuery,
    streamQuery: () => {
      throw new Error("not implemented");
    },
  };
  const driver: Driver = {
    init: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
    acquireConnection: () => Promise.resolve(connection),
    releaseConnection: () => Promise.resolve(),
    beginTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
  };
  return {
    createAdapter: () => ({}) as never,
    createDriver: () => driver,
    createIntrospector: () => ({}) as never,
    createQueryCompiler: () => ({}) as never,
  };
}

describe("buildSqlComment", () => {
  it("emits the expected sqlcommenter shape", () => {
    const comment = buildSqlComment({
      route: "/api/v1/cards/:cardSlug",
      traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
    });
    expect(comment).toBe(
      "/* route='%2Fapi%2Fv1%2Fcards%2F%3AcardSlug',traceparent='00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01' */ ",
    );
  });

  it("escapes single quotes by doubling, after URL encoding", () => {
    const comment = buildSqlComment({
      route: "cron:job'with'quotes",
      traceparent: "00-x-y-01",
    });
    // encodeURIComponent leaves ' alone, then we double it. Verify both remain.
    expect(comment).toContain("cron%3Ajob''with''quotes");
  });

  it("encodes characters that would close a comment or break the SQL string", () => {
    const comment = buildSqlComment({
      route: "weird*/route\nwith\twhitespace",
      traceparent: "00-x-y-01",
    });
    // The leading `/* ` and trailing ` */ ` are the only comment delimiters;
    // any `*/` inside the value would prematurely close the comment, but the
    // `/` is URL-encoded to `%2F` so the sequence cannot appear in the value.
    const valueRegion = comment.slice(3, -4);
    expect(valueRegion).not.toContain("*/");
    expect(valueRegion).not.toContain("\n");
    expect(valueRegion).not.toContain("\t");
    expect(comment).toContain("*%2F"); // `*/` after slash encoding
    expect(comment).toContain("%0A"); // \n
    expect(comment).toContain("%09"); // \t
  });
});

describe("CommentingDialect", () => {
  it("prepends the comment when a request context is active", async () => {
    const captured = vi.fn(async () => ({ rows: [] }) as QueryResult<unknown>);
    const dialect = new CommentingDialect(fakeDialect(captured));
    const driver = dialect.createDriver();
    const conn = await driver.acquireConnection();

    await requestCtx.run({ route: "/api/v1/cards/:cardSlug", traceparent: "00-aaaa-bbbb-01" }, () =>
      conn.executeQuery(makeCompiled("SELECT 1")),
    );

    expect(captured).toHaveBeenCalledOnce();
    const wrapped = captured.mock.calls[0]?.[0] as CompiledQuery;
    expect(wrapped.sql).toBe(
      "/* route='%2Fapi%2Fv1%2Fcards%2F%3AcardSlug',traceparent='00-aaaa-bbbb-01' */ SELECT 1",
    );
  });

  it("passes the query through unchanged when no context is set", async () => {
    const captured = vi.fn(async () => ({ rows: [] }) as QueryResult<unknown>);
    const dialect = new CommentingDialect(fakeDialect(captured));
    const driver = dialect.createDriver();
    const conn = await driver.acquireConnection();

    await conn.executeQuery(makeCompiled("SELECT 2"));

    const passedThrough = captured.mock.calls[0]?.[0] as CompiledQuery;
    expect(passedThrough.sql).toBe("SELECT 2");
  });

  it("unwraps connections when delegating transaction lifecycle calls", async () => {
    const beginTransaction = vi.fn(async () => undefined);
    const releaseConnection = vi.fn(async () => undefined);
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
    const dialect = new CommentingDialect({
      createAdapter: () => ({}) as never,
      createDriver: () => innerDriver,
      createIntrospector: () => ({}) as never,
      createQueryCompiler: () => ({}) as never,
    });
    const driver = dialect.createDriver();
    const wrappedConn = await driver.acquireConnection();

    await driver.beginTransaction(wrappedConn, {});
    await driver.releaseConnection(wrappedConn);

    // Inner driver must have received the inner connection, not our wrapper,
    // so its identity checks (e.g. WeakMap-based tx tracking) keep working.
    expect(beginTransaction.mock.calls[0]?.[0]).toBe(innerConn);
    expect(releaseConnection.mock.calls[0]?.[0]).toBe(innerConn);
  });
});
