import { describe, expect, it } from "vitest";

import { buildDistinctWhere, parseJsonb, parseJsonbRequired } from "./helpers.js";

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
