import { describe, expect, it } from "vitest";

import { parseSearch, stringifySearch } from "./search-serialization";

describe("stringifySearch", () => {
  it("serializes multi-element arrays with comma format", () => {
    expect(stringifySearch({ languages: ["EN", "FR", "ZH"] })).toBe("?languages=EN,FR,ZH");
  });

  it("serializes single-element arrays without a comma", () => {
    expect(stringifySearch({ languages: ["EN"] })).toBe("?languages=EN");
  });

  it("JSON-encodes numbers so they round-trip as numbers", () => {
    expect(stringifySearch({ energyMin: 3 })).toBe("?energyMin=3");
  });

  it("JSON-encodes booleans so they round-trip as booleans", () => {
    expect(stringifySearch({ browsing: true })).toBe("?browsing=true");
  });

  it("leaves plain strings unencoded when they aren't JSON-parseable", () => {
    expect(stringifySearch({ search: "hello" })).toBe("?search=hello");
  });

  it("quotes strings that look like numbers so they stay strings", () => {
    expect(stringifySearch({ search: "123" })).toBe("?search=%22123%22");
  });

  it("skips undefined values", () => {
    expect(stringifySearch({ search: undefined, view: "grid" })).toBe("?view=grid");
  });

  it("returns empty string for an empty object", () => {
    expect(stringifySearch({})).toBe("");
  });

  it("JSON-encodes nested objects", () => {
    expect(stringifySearch({ filters: { a: 1 } })).toBe("?filters=%7B%22a%22%3A1%7D");
  });
});

describe("parseSearch", () => {
  it("parses comma-separated arrays back into arrays of strings", () => {
    expect(parseSearch("?languages=EN,FR,ZH")).toEqual({
      languages: ["EN", "FR", "ZH"],
    });
  });

  it("JSON-parses numeric values", () => {
    expect(parseSearch("?energyMin=3")).toEqual({ energyMin: 3 });
  });

  it("JSON-parses boolean values", () => {
    expect(parseSearch("?browsing=true")).toEqual({ browsing: true });
  });

  it("keeps unquoted strings as strings", () => {
    expect(parseSearch("?search=hello")).toEqual({ search: "hello" });
  });

  it("unquotes JSON-quoted strings that look numeric", () => {
    expect(parseSearch('?search="123"')).toEqual({ search: "123" });
  });

  it("handles leading ? and missing ?", () => {
    expect(parseSearch("foo=bar")).toEqual({ foo: "bar" });
    expect(parseSearch("?foo=bar")).toEqual({ foo: "bar" });
  });

  it("round-trips multi-element arrays as clean URLs (regression: qs received array per-value, producing 0=EN&1=FR nested)", () => {
    const input = { languages: ["EN", "FR", "ZH"] };
    expect(parseSearch(stringifySearch(input))).toEqual(input);
  });

  it("round-trips mixed primitives", () => {
    const input = {
      search: "hello",
      energyMin: 3,
      browsing: true,
      sets: ["OGN", "OGS"],
    };
    expect(parseSearch(stringifySearch(input))).toEqual(input);
  });
});
