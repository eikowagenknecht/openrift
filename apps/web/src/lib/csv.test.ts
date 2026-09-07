import { describe, expect, it } from "vitest";

import { parseCSV, parseCSVWithHeaders } from "./csv";

describe("parseCSV", () => {
  it("parses a simple unquoted row", () => {
    expect(parseCSV("a,b,c")).toEqual([["a", "b", "c"]]);
  });

  it(String.raw`parses multiple rows separated by \n`, () => {
    expect(parseCSV("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it(String.raw`parses rows separated by \r\n`, () => {
    expect(parseCSV("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("handles a quoted field containing a comma", () => {
    expect(parseCSV('"a,b",c')).toEqual([["a,b", "c"]]);
  });

  it("handles a quoted field containing an embedded newline", () => {
    expect(parseCSV('"a\nb",c')).toEqual([["a\nb", "c"]]);
  });

  it("unescapes doubled double-quotes inside a quoted field", () => {
    expect(parseCSV('"say ""hi""",b')).toEqual([['say "hi"', "b"]]);
  });

  it("handles an empty quoted field", () => {
    expect(parseCSV('"",b')).toEqual([["", "b"]]);
  });

  it("drops a trailing comma at end of input rather than adding an empty field", () => {
    expect(parseCSV('"a",')).toEqual([["a"]]);
    expect(parseCSV("a,")).toEqual([["a"]]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseCSV("")).toEqual([]);
  });

  it("skips blank lines", () => {
    expect(parseCSV("a,b\n\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("skips a trailing blank line", () => {
    expect(parseCSV("a,b\n")).toEqual([["a", "b"]]);
  });

  it("does not skip a row that is a single non-empty field", () => {
    expect(parseCSV("a\nb")).toEqual([["a"], ["b"]]);
  });

  it("handles an unterminated quoted field at end of input", () => {
    expect(parseCSV('"abc')).toEqual([["abc"]]);
  });

  it("treats a doubled quote right at end of input as an escaped quote", () => {
    expect(parseCSV('"a""')).toEqual([['a"']]);
  });

  it("handles mixed quoted and unquoted fields in one row", () => {
    expect(parseCSV('1,"two, and two",3')).toEqual([["1", "two, and two", "3"]]);
  });
});

describe("parseCSVWithHeaders", () => {
  it("maps rows to objects keyed by trimmed headers", () => {
    expect(parseCSVWithHeaders("name, qty\nFoo,2\nBar,3")).toEqual([
      { name: "Foo", qty: "2" },
      { name: "Bar", qty: "3" },
    ]);
  });

  it("trims field values", () => {
    expect(parseCSVWithHeaders("name,qty\n Foo , 2 ")).toEqual([{ name: "Foo", qty: "2" }]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCSVWithHeaders("")).toEqual([]);
  });

  it("returns an empty array when there is only a header row", () => {
    expect(parseCSVWithHeaders("name,qty")).toEqual([]);
  });

  it("fills missing trailing columns with empty strings", () => {
    expect(parseCSVWithHeaders("a,b,c\n1,2")).toEqual([{ a: "1", b: "2", c: "" }]);
  });
});
