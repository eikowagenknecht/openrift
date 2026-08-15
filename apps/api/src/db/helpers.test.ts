import type { RawBuilder } from "kysely";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";

import {
  asJsonb,
  asJsonbNullable,
  buildDistinctWhere,
  parseJsonb,
  parseJsonbRequired,
} from "./helpers.js";

describe("buildDistinctWhere", () => {
  it("builds a single-column DISTINCT check", () => {
    const result = buildDistinctWhere("my_table", ["col_a"]);
    expect(result).toBeDefined();
  });

  it("builds a multi-column DISTINCT check with OR separators", () => {
    const result = buildDistinctWhere("t", ["col_a", "col_b", "col_c"]);
    expect(result).toBeDefined();
  });
});

/** Compiles a raw fragment without a database, the same way production compiles it. */
const compileDb = new Kysely<Record<string, never>>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/** @returns The fragment's compiled SQL and bound parameters. */
function compile(fragment: RawBuilder<unknown>) {
  const compiled = fragment.compile(compileDb);
  return { sql: compiled.sql, parameters: compiled.parameters };
}

describe("asJsonb", () => {
  // A lone `::jsonb` leaves Postgres describing the parameter as jsonb, which
  // makes postgres.js JSON-encode the text a second time and store a string
  // scalar. The `::text` hop is what keeps the value a plain string on the
  // wire, so the shape of this cast is the behavior, not a formatting detail.
  it("casts through text so the parameter is not described as jsonb", () => {
    expect(compile(asJsonb('{"a":1}')).sql).toBe("$1::text::jsonb");
  });

  it("binds the JSON text as a single parameter", () => {
    expect(compile(asJsonb('{"a":1}')).parameters).toEqual(['{"a":1}']);
  });
});

describe("asJsonbNullable", () => {
  it("casts a value the same way asJsonb does", () => {
    expect(compile(asJsonbNullable('{"a":1}')!).sql).toBe("$1::text::jsonb");
  });

  it("returns null for null", () => {
    expect(asJsonbNullable(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(asJsonbNullable(undefined)).toBeNull();
  });
});

describe("parseJsonb", () => {
  it("parses a raw JSON string as returned by postgres.js under Bun", () => {
    expect(parseJsonb<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns an already-parsed object unchanged", () => {
    const value = { a: 1 };
    expect(parseJsonb(value)).toBe(value);
  });

  it("parses JSON arrays", () => {
    expect(parseJsonb<string[]>('["x","y"]')).toEqual(["x", "y"]);
  });

  it("returns null for null", () => {
    expect(parseJsonb(null)).toBeNull();
  });

  it("returns null for undefined (a left-joined jsonb column)", () => {
    expect(parseJsonb(undefined as unknown as null)).toBeNull();
  });
});

describe("parseJsonbRequired", () => {
  it("parses a raw JSON string as returned by postgres.js under Bun", () => {
    expect(parseJsonbRequired<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns an already-parsed object unchanged", () => {
    const value = { a: 1 };
    expect(parseJsonbRequired(value)).toBe(value);
  });

  it("parses JSON arrays", () => {
    expect(parseJsonbRequired<string[]>('["x","y"]')).toEqual(["x", "y"]);
  });
});
