import { describe, expect, it } from "bun:test";

import { deriveArtVariant, parseKeywords, stripHtml, toBaseSourceId } from "./fetch-catalog";

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe("stripHtml", () => {
  it("strips HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("converts <br> to newlines", () => {
    expect(stripHtml("Line 1<br>Line 2")).toBe("Line 1\nLine 2");
  });

  it("converts <br /> to newlines", () => {
    expect(stripHtml("Line 1<br />Line 2")).toBe("Line 1\nLine 2");
  });

  it("converts <br/> to newlines", () => {
    expect(stripHtml("Line 1<br/>Line 2")).toBe("Line 1\nLine 2");
  });

  it("decodes &amp;", () => {
    expect(stripHtml("A &amp; B")).toBe("A & B");
  });

  it("decodes &lt; and &gt;", () => {
    expect(stripHtml("&lt;tag&gt;")).toBe("<tag>");
  });

  it("decodes &quot;", () => {
    expect(stripHtml("He said &quot;hi&quot;")).toBe('He said "hi"');
  });

  it("decodes &#39;", () => {
    expect(stripHtml("it&#39;s")).toBe("it's");
  });

  it("decodes &nbsp;", () => {
    expect(stripHtml("hello&nbsp;world")).toBe("hello world");
  });

  it("trims whitespace", () => {
    expect(stripHtml("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  it("handles combined entities and tags", () => {
    expect(stripHtml("<p>A &amp; B &lt;3</p>")).toBe("A & B <3");
  });
});

// ---------------------------------------------------------------------------
// parseKeywords
// ---------------------------------------------------------------------------

describe("parseKeywords", () => {
  it("returns empty array for text with no keywords", () => {
    expect(parseKeywords("No keywords here")).toEqual([]);
  });

  it("extracts a single keyword", () => {
    expect(parseKeywords("This has [Shield] in it")).toEqual(["Shield"]);
  });

  it("extracts multiple keywords", () => {
    expect(parseKeywords("[Shield] and [Burn]")).toEqual(["Shield", "Burn"]);
  });

  it("deduplicates keywords", () => {
    expect(parseKeywords("[Shield] then [Shield] again")).toEqual(["Shield"]);
  });

  it("handles keywords with numbers", () => {
    expect(parseKeywords("[Burn 2] deals damage")).toEqual(["Burn 2"]);
  });

  it("handles hyphenated keywords", () => {
    expect(parseKeywords("[Quick-Strike] is fast")).toEqual(["Quick-Strike"]);
  });

  it("handles multi-word keywords", () => {
    expect(parseKeywords("[Last Stand] activates")).toEqual(["Last Stand"]);
  });

  it("ignores brackets with lowercase start", () => {
    expect(parseKeywords("[nope] should not match")).toEqual([]);
  });

  it("handles empty string", () => {
    expect(parseKeywords("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deriveArtVariant
// ---------------------------------------------------------------------------

describe("deriveArtVariant", () => {
  it("returns normal for a standard card within printed total", () => {
    expect(deriveArtVariant("SET1-001", 1, 100)).toEqual({
      artVariant: "normal",
      isSigned: false,
    });
  });

  it("detects signed variant from * suffix", () => {
    expect(deriveArtVariant("SET1-001*", 1, 100)).toEqual({
      artVariant: "normal",
      isSigned: true,
    });
  });

  it("detects altart from lowercase letter suffix", () => {
    expect(deriveArtVariant("SET1-001a", 1, 100)).toEqual({
      artVariant: "altart",
      isSigned: false,
    });
  });

  it("detects signed altart", () => {
    expect(deriveArtVariant("SET1-001a*", 1, 100)).toEqual({
      artVariant: "altart",
      isSigned: true,
    });
  });

  it("detects overnumbered when collectorNumber exceeds printedTotal", () => {
    expect(deriveArtVariant("SET1-101", 101, 100)).toEqual({
      artVariant: "overnumbered",
      isSigned: false,
    });
  });

  it("detects signed overnumbered", () => {
    expect(deriveArtVariant("SET1-101*", 101, 100)).toEqual({
      artVariant: "overnumbered",
      isSigned: true,
    });
  });

  it("returns normal when collectorNumber equals printedTotal", () => {
    expect(deriveArtVariant("SET1-100", 100, 100)).toEqual({
      artVariant: "normal",
      isSigned: false,
    });
  });
});

// ---------------------------------------------------------------------------
// toBaseSourceId
// ---------------------------------------------------------------------------

describe("toBaseSourceId", () => {
  it("returns the ID unchanged when no suffix", () => {
    expect(toBaseSourceId("SET1-001")).toBe("SET1-001");
  });

  it("strips lowercase letter suffix", () => {
    expect(toBaseSourceId("SET1-027a")).toBe("SET1-027");
  });

  it("strips signed suffix", () => {
    expect(toBaseSourceId("SET1-001*")).toBe("SET1-001");
  });

  it("strips combined altart + signed suffix", () => {
    expect(toBaseSourceId("SET1-027a*")).toBe("SET1-027");
  });

  it("strips multiple lowercase letters", () => {
    expect(toBaseSourceId("OGN-050ab")).toBe("OGN-050");
  });

  it("preserves IDs with uppercase-only segments", () => {
    expect(toBaseSourceId("SFD-T03")).toBe("SFD-T03");
  });

  it("strips altart suffix after uppercase segment", () => {
    expect(toBaseSourceId("SFD-R01b")).toBe("SFD-R01");
  });
});
