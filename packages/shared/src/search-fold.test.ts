import { describe, expect, it } from "vitest";

import { foldCached, foldForSearch, squashCached, squashForSearch } from "./search-fold.js";

describe("foldForSearch", () => {
  it("collapses the apostrophe variants a user might type", () => {
    // The catalogue stores U+2019; a keyboard produces U+0027; users also omit it.
    expect(foldForSearch("Doran’s Shield")).toBe("dorans shield");
    expect(foldForSearch("Doran's Shield")).toBe("dorans shield");
    expect(foldForSearch("Dorans Shield")).toBe("dorans shield");
    expect(foldForSearch("Kai’Sa, Survivor")).toBe("kaisa, survivor");
  });

  it("removes quote marks in both curly and straight forms", () => {
    expect(foldForSearch("“quoted”")).toBe("quoted");
    expect(foldForSearch('"quoted"')).toBe("quoted");
    expect(foldForSearch("‘single’")).toBe("single");
  });

  it("normalizes every dash variant onto the ASCII hyphen and keeps it", () => {
    // fixTypography rewrites "-1" to "−1" with U+2212 MINUS SIGN, and rules text
    // also contains U+2011 NON-BREAKING HYPHEN.
    expect(foldForSearch("Give a unit −1")).toBe("give a unit -1");
    expect(foldForSearch("Give a unit -1")).toBe("give a unit -1");
    expect(foldForSearch("rune_fury ‑ Deal 2")).toBe("rune_fury - deal 2");
    expect(foldForSearch("revenge—it’s")).toBe("revenge-its");
  });

  it("folds diacritics onto their base letter", () => {
    expect(foldForSearch("épéeback")).toBe("epeeback");
    expect(foldForSearch("unité")).toBe("unite");
    expect(foldForSearch("Fußkämpfer")).toBe("fusskampfer");
  });

  it("keeps rules-text markup verbatim", () => {
    // Folding these to spaces made `d:[equip]` match 63 cards instead of 14 and
    // `d:−1 might` match 183 instead of 7. Precision here is the whole point.
    expect(foldForSearch("[Equip] :rb_might:")).toBe("[equip] :rb_might:");
    expect(foldForSearch("_(italic)_")).toBe("_(italic)_");
    expect(foldForSearch("Choose one —\n• Deal 4")).toBe("choose one - • deal 4");
    expect(foldForSearch("damage. Draw a card")).toBe("damage. draw a card");
  });

  it("keeps characters it does not recognize, so CJK stays searchable", () => {
    // normalizeNameForIdentity deletes these outright, which is why it could not
    // be reused here.
    expect(foldForSearch("莺之歌")).toBe("莺之歌");
    expect(foldForSearch("黯荧岛Dark Glow")).toBe("黯荧岛dark glow");
  });

  it("normalizes fullwidth punctuation via NFKD", () => {
    expect(foldForSearch("波比，扶弱使者")).toBe("波比,扶弱使者");
  });

  it("decomposes the ellipsis so typed dots line up with it", () => {
    expect(foldForSearch("wait…")).toBe("wait...");
    expect(foldForSearch("wait...")).toBe("wait...");
  });

  it("collapses whitespace runs and trims", () => {
    expect(foldForSearch("  two   words \n")).toBe("two words");
  });

  it("returns an empty string for input made only of removed marks", () => {
    expect(foldForSearch("'")).toBe("");
    expect(foldForSearch("’“”")).toBe("");
    expect(foldForSearch("")).toBe("");
  });

  it("is idempotent", () => {
    for (const input of ["Doran’s Shield", "épéeback", "Give a unit −1", "黯荧岛Dark Glow"]) {
      expect(foldForSearch(foldForSearch(input))).toBe(foldForSearch(input));
    }
  });
});

describe("squashForSearch", () => {
  it("removes separators so an unpunctuated query still matches", () => {
    expect(squashForSearch("Quick-Draw")).toBe("quickdraw");
    expect(squashForSearch("quickdraw")).toBe("quickdraw");
    expect(squashForSearch("OGN-269")).toBe("ogn269");
    expect(squashForSearch("ogn269")).toBe("ogn269");
    expect(squashForSearch("Kai’Sa, Survivor")).toBe("kaisasurvivor");
    expect(squashForSearch("Dr. Mundo, Expert")).toBe("drmundoexpert");
  });

  it("keeps letters and numbers from any script", () => {
    // The [^a-z0-9] form used by normalizeNameForIdentity emptied these.
    expect(squashForSearch("莺之歌")).toBe("莺之歌");
    expect(squashForSearch("張漁 ·ZHANG YU")).toBe("張漁zhangyu");
    expect(squashForSearch("unité")).toBe("unite");
  });

  it("returns an empty string for punctuation-only input", () => {
    expect(squashForSearch("—")).toBe("");
    expect(squashForSearch("'")).toBe("");
  });
});

describe("caches", () => {
  it("returns the same result as the uncached functions", () => {
    for (const input of ["Doran’s Shield", "Quick-Draw", "莺之歌", "Give a unit −1"]) {
      expect(foldCached(input)).toBe(foldForSearch(input));
      expect(squashCached(input)).toBe(squashForSearch(input));
    }
  });

  it("is stable across repeated calls", () => {
    expect(foldCached("Doran’s Shield")).toBe("dorans shield");
    expect(foldCached("Doran’s Shield")).toBe("dorans shield");
    expect(squashCached("Quick-Draw")).toBe("quickdraw");
    expect(squashCached("Quick-Draw")).toBe("quickdraw");
  });
});
