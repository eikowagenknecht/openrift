import { describe, expect, it } from "vitest";

import { makePrinting as stubPrinting } from "./test-factories.js";
import type { CardType, Printing } from "./types/index";
import {
  boundsOf,
  capitalize,
  compareCardDisplayName,
  compareWithLanguagePreference,
  deckIdentityLabels,
  deduplicateByCard,
  formatCents,
  formatPrintingLabel,
  centsToDollars,
  emptyToNull,
  getOrientation,
  cardSearchAltNames,
  labelMap,
  legendDisplayName,
  metaLegendSlug,
  mostCommonValue,
  normalizeNameForIdentity,
  preferredPrinting,
  sentenceCaseSlug,
  sortByLanguageAndCanonicalRank,
  straightenApostrophes,
  titleCaseSlug,
  toCents,
  trimToNull,
  truncateWithEllipsis,
  unique,
} from "./utils";

function makePrinting(overrides: Partial<Printing> & { language: string }): Printing {
  return stubPrinting({
    id: "p1",
    cardId: "card1",
    setId: "SET-A",
    setSlug: "set-a",
    artVariant: "standard",
    publicCode: "001",
    card: { slug: "card-1", name: "Card 1" },
    ...overrides,
  });
}

describe("legendDisplayName", () => {
  it("prepends the champion tag for a Legend", () => {
    expect(
      legendDisplayName({ name: "Emperor of the Sands", types: ["legend"], tags: ["Azir"] }),
    ).toBe("Azir, Emperor of the Sands");
  });

  it("returns the bare name for a Legend with no tags", () => {
    expect(legendDisplayName({ name: "Nameless Legend", types: ["legend"], tags: [] })).toBe(
      "Nameless Legend",
    );
  });

  it("uses the first tag when a Legend has several", () => {
    expect(
      legendDisplayName({ name: "Twin Souls", types: ["legend"], tags: ["Kindred", "Lamb"] }),
    ).toBe("Kindred, Twin Souls");
  });

  it("leaves a name that already leads with the champion alone", () => {
    expect(legendDisplayName({ name: "Sett, Kingpin", types: ["legend"], tags: ["Sett"] })).toBe(
      "Sett, Kingpin",
    );
  });

  it("drops a print-run qualifier after the epithet", () => {
    expect(
      legendDisplayName({ name: "Dark Child, Starter", types: ["legend"], tags: ["Annie"] }),
    ).toBe("Annie, Dark Child");
  });

  it("keeps a comma in a non-Legend name, where it separates champion and epithet", () => {
    expect(legendDisplayName({ name: "Garen, Crownguard", types: ["unit"], tags: ["Garen"] })).toBe(
      "Garen, Crownguard",
    );
  });

  it("returns the bare name for non-Legend cards even when tagged", () => {
    expect(legendDisplayName({ name: "Recall", types: ["spell"], tags: ["Azir"] })).toBe("Recall");
  });
});

describe("metaLegendSlug", () => {
  it("leads with the champion and keeps the card slug behind it", () => {
    expect(metaLegendSlug("Kennen, Heart of the Tempest", "heart-of-the-tempest")).toBe(
      "kennen-heart-of-the-tempest",
    );
  });

  it("keys an untagged legend on its card slug alone", () => {
    expect(metaLegendSlug("Nameless Legend", "nameless-legend")).toBe("nameless-legend");
  });

  it("separates two legends of the same champion", () => {
    expect(metaLegendSlug("Master Yi, Wuju Master", "wuju-master")).toBe("master-yi-wuju-master");
    expect(metaLegendSlug("Master Yi, Wuju Bladesman", "wuju-bladesman-starter")).toBe(
      "master-yi-wuju-bladesman-starter",
    );
  });

  it("slugifies a champion whose name carries punctuation or spaces", () => {
    expect(metaLegendSlug("Kai’Sa, Survivor", "survivor")).toBe("kai-sa-survivor");
    expect(metaLegendSlug("Lee Sin, Blind Monk", "blind-monk")).toBe("lee-sin-blind-monk");
  });

  it("round-trips the name legendDisplayName composes", () => {
    const name = legendDisplayName({
      name: "Dark Child, Starter",
      types: ["legend"],
      tags: ["Annie"],
    });
    expect(metaLegendSlug(name, "dark-child-starter")).toBe("annie-dark-child-starter");
  });
});

describe("compareCardDisplayName", () => {
  const azir = { name: "Emperor of the Sands", types: ["legend" as CardType], tags: ["Azir"] };
  const bolt = { name: "Bolt", types: ["spell" as CardType], tags: [] };

  it("files a Legend under its champion, not its epithet", () => {
    expect(compareCardDisplayName(azir, bolt)).toBeLessThan(0);
    expect(compareCardDisplayName(bolt, azir)).toBeGreaterThan(0);
  });

  it("sorts a list the way the labels read", () => {
    const zed = { name: "Master of Shadows", types: ["legend" as CardType], tags: ["Zed"] };
    expect([zed, azir, bolt].toSorted(compareCardDisplayName).map((card) => card.name)).toEqual([
      "Emperor of the Sands",
      "Bolt",
      "Master of Shadows",
    ]);
  });
});

describe("cardSearchAltNames", () => {
  const azir = { name: "Emperor of the Sands", types: ["legend" as CardType], tags: ["Azir"] };
  const recall = { name: "Recall", types: ["spell" as CardType], tags: ["Azir"] };

  it("offers a Legend's colloquial champion form", () => {
    expect(cardSearchAltNames(azir)).toEqual(["Azir, Emperor of the Sands"]);
  });

  it("never repeats the canonical name", () => {
    // A non-Legend's display name is its own name, so there is no alternate.
    expect(cardSearchAltNames(recall)).toEqual([]);
    expect(cardSearchAltNames(azir, ["Emperor of the Sands"])).toEqual([
      "Azir, Emperor of the Sands",
    ]);
  });

  it("appends the caller's extra names", () => {
    expect(cardSearchAltNames(azir, ["沙漠皇帝", "azirdesertemperor"])).toEqual([
      "Azir, Emperor of the Sands",
      "沙漠皇帝",
      "azirdesertemperor",
    ]);
  });

  it("drops nullish and duplicate extras", () => {
    expect(
      cardSearchAltNames(recall, [null, undefined, "", "Recall Spell", "Recall Spell"]),
    ).toEqual(["Recall Spell"]);
  });
});

describe("deckIdentityLabels", () => {
  const melLegend = { name: "Soul’s Reflection", types: ["legend" as CardType], tags: ["Mel"] };

  it("factors out the champion both cards name", () => {
    expect(deckIdentityLabels(melLegend, { name: "Mel, Newly Awakened" })).toEqual({
      character: "Mel",
      legend: "Soul’s Reflection",
      champion: "Newly Awakened",
    });
  });

  it("keeps full names when the pair names different champions", () => {
    expect(deckIdentityLabels(melLegend, { name: "Viktor, Innovator" })).toEqual({
      legend: "Mel, Soul’s Reflection",
      champion: "Viktor, Innovator",
    });
  });

  it("keeps the full name when the champion unit is the bare champion", () => {
    expect(deckIdentityLabels(melLegend, { name: "Mel" })).toEqual({
      legend: "Mel, Soul’s Reflection",
      champion: "Mel",
    });
  });

  it("splits the champion on the tag, not the first comma, and drops the Legend's qualifier", () => {
    expect(
      deckIdentityLabels(
        { name: "Dark Child, Starter", types: ["legend"], tags: ["Annie"] },
        { name: "Annie, Child of Fire" },
      ),
    ).toEqual({
      character: "Annie",
      legend: "Dark Child",
      champion: "Child of Fire",
    });
  });

  it("leaves a tagless Legend alone", () => {
    expect(
      deckIdentityLabels({ name: "Nameless Legend", types: ["legend"], tags: [] }, { name: "Mel" }),
    ).toEqual({ legend: "Nameless Legend", champion: "Mel" });
  });

  it("handles a half-built deck with only one side", () => {
    expect(deckIdentityLabels(melLegend, undefined)).toEqual({
      legend: "Mel, Soul’s Reflection",
      champion: undefined,
    });
    expect(deckIdentityLabels(undefined, { name: "Mel, Newly Awakened" })).toEqual({
      legend: undefined,
      champion: "Mel, Newly Awakened",
    });
  });
});

describe("unique", () => {
  it("returns empty array for empty input", () => {
    expect(unique([])).toEqual([]);
  });

  it("preserves insertion order of first occurrences", () => {
    expect(unique([3, 1, 2, 1, 3])).toEqual([3, 1, 2]);
  });

  it("returns same elements when no duplicates", () => {
    expect(unique(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("deduplicates strings", () => {
    expect(unique(["foo", "bar", "foo", "baz", "bar"])).toEqual(["foo", "bar", "baz"]);
  });

  it("handles single-element array", () => {
    expect(unique([42])).toEqual([42]);
  });
});

describe("formatPrintingLabel", () => {
  it("builds a basic unmarked slug", () => {
    expect(formatPrintingLabel("OGN-001", [], "normal")).toBe("OGN-001::normal");
  });

  it("includes a single marker slug", () => {
    expect(formatPrintingLabel("OGN-001", ["promo"], "foil")).toBe("OGN-001:promo:foil");
  });

  it("joins multiple marker slugs with +", () => {
    expect(formatPrintingLabel("OGN-001", ["promo", "top-8"], "foil")).toBe(
      "OGN-001:promo+top-8:foil",
    );
  });

  it("preserves finish value", () => {
    expect(formatPrintingLabel("OGN-105", [], "normal")).toBe("OGN-105::normal");
  });

  it("prepends EN language prefix when explicit", () => {
    expect(formatPrintingLabel("OGN-001", [], "normal", "EN")).toBe("EN:OGN-001::normal");
  });

  it("omits language prefix when language is null", () => {
    expect(formatPrintingLabel("OGN-001", [], "normal", null)).toBe("OGN-001::normal");
  });

  it("omits language prefix when language is undefined", () => {
    expect(formatPrintingLabel("OGN-001", [], "normal", undefined)).toBe("OGN-001::normal");
  });

  it("prepends language prefix for non-EN languages", () => {
    expect(formatPrintingLabel("OGN-001", [], "normal", "FR")).toBe("FR:OGN-001::normal");
  });

  it("prepends language prefix with marker", () => {
    expect(formatPrintingLabel("OGN-001", ["promo"], "foil", "SC")).toBe("SC:OGN-001:promo:foil");
  });

  it("appends a non-standard size segment", () => {
    expect(formatPrintingLabel("OGN-279", [], "normal", "EN", "oversized")).toBe(
      "EN:OGN-279::normal:oversized",
    );
  });

  it("omits the size segment for standard printings", () => {
    expect(formatPrintingLabel("OGN-279", [], "normal", "EN", "standard")).toBe(
      "EN:OGN-279::normal",
    );
  });

  it("omits the size segment when size is undefined", () => {
    expect(formatPrintingLabel("OGN-279", [], "normal", "EN")).toBe("EN:OGN-279::normal");
  });
});

describe("boundsOf", () => {
  it("returns { min: 0, max: 0 } for empty array", () => {
    expect(boundsOf([])).toEqual({ min: 0, max: 0 });
  });

  it("returns same value for single integer element", () => {
    expect(boundsOf([5])).toEqual({ min: 5, max: 5 });
  });

  it("finds min and max across multiple values", () => {
    expect(boundsOf([3, 1, 7, 2])).toEqual({ min: 1, max: 7 });
  });

  it("floors min and ceils max for fractional values", () => {
    expect(boundsOf([2.3, 5.7])).toEqual({ min: 2, max: 6 });
  });

  it("handles negative values", () => {
    expect(boundsOf([-3.5, 2.1])).toEqual({ min: -4, max: 3 });
  });

  it("handles all-equal values", () => {
    expect(boundsOf([4, 4, 4])).toEqual({ min: 4, max: 4 });
  });

  it("floors and ceils a single fractional value", () => {
    expect(boundsOf([3.5])).toEqual({ min: 3, max: 4 });
  });
});

describe("normalizeNameForIdentity", () => {
  it("lowercases and strips non-alphanumeric characters", () => {
    expect(normalizeNameForIdentity("Kai'Sa, Survivor")).toBe("kaisasurvivor");
  });

  it("removes hyphens", () => {
    expect(normalizeNameForIdentity("Mega-Mech")).toBe("megamech");
  });

  it("removes spaces", () => {
    expect(normalizeNameForIdentity("KaiSa Survivor")).toBe("kaisasurvivor");
  });

  it("returns empty string for all-special-character input", () => {
    expect(normalizeNameForIdentity("!@#$%^&*()")).toBe("");
  });

  it("handles already-clean lowercase input", () => {
    expect(normalizeNameForIdentity("fireball")).toBe("fireball");
  });

  it("handles mixed case with numbers", () => {
    expect(normalizeNameForIdentity("Unit-42X")).toBe("unit42x");
  });

  // The ASCII-only `[^a-z0-9]` form emptied every one of these, and because the
  // result is a grouping key, all of them collided into a single bucket — the
  // admin candidates list once showed seven unrelated legends as one row.
  describe("non-Latin scripts", () => {
    it("keeps a CJK name instead of emptying it", () => {
      expect(normalizeNameForIdentity("影流之主")).toBe("影流之主");
    });

    it("keeps Japanese kana and drops the ideographic comma", () => {
      expect(normalizeNameForIdentity("ゼド、影の主")).toBe("ゼド影の主");
    });

    it("keeps Korean hangul", () => {
      expect(normalizeNameForIdentity("한글 카드")).toBe("한글카드");
    });

    it("keeps Cyrillic", () => {
      expect(normalizeNameForIdentity("Владыка Теней")).toBe("владыкатеней");
    });

    it("keeps Greek", () => {
      expect(normalizeNameForIdentity("Άρχοντας")).toBe("άρχοντας");
    });

    it("gives distinct keys to distinct non-Latin names", () => {
      // The property that actually matters: no silent collision.
      const names = ["影流之主", "祖安狂人", "德玛西亚之力", "Владыка Теней", "Άρχοντας"];
      const keys = names.map((n) => normalizeNameForIdentity(n));
      expect(new Set(keys).size).toBe(names.length);
      expect(keys).not.toContain("");
    });

    it("does not fold Cyrillic short-i onto i", () => {
      // NFKD would decompose й to и + breve and merge these two distinct
      // names. Accents are deliberately not folded for exactly this reason.
      expect(normalizeNameForIdentity("Тений")).not.toBe(normalizeNameForIdentity("Тени"));
    });
  });

  describe("mixed script", () => {
    it("keeps both halves of a mixed CJK/Latin name", () => {
      expect(normalizeNameForIdentity("黯荧岛Dark Glow")).toBe("黯荧岛darkglow");
    });

    it("keeps an accented Latin letter rather than deleting it", () => {
      expect(normalizeNameForIdentity("Autel d'unité")).toBe("auteldunité");
    });
  });

  describe("names with no letters or digits", () => {
    it("still returns empty for punctuation-only input", () => {
      expect(normalizeNameForIdentity("!?!")).toBe("");
    });

    it("returns empty for symbol-only input", () => {
      expect(normalizeNameForIdentity("★☆")).toBe("");
      expect(normalizeNameForIdentity("🎴")).toBe("");
    });
  });

  // `\p{N}` would keep these; PostgreSQL's `[[:alnum:]]` drops them. The class
  // is narrowed to `\p{Nd}` + `\p{Nl}` so the TS and SQL keys stay identical.
  describe("Postgres [[:alnum:]] parity", () => {
    it("drops other-number characters", () => {
      expect(normalizeNameForIdentity("½ half")).toBe("half");
      expect(normalizeNameForIdentity("¾ x ² y ① z ⅓")).toBe("xyz");
    });

    it("keeps decimal digits from other scripts", () => {
      expect(normalizeNameForIdentity("٣٤٥ arabic")).toBe("٣٤٥arabic");
    });

    it("keeps letter-number characters", () => {
      expect(normalizeNameForIdentity("Ⅻ roman")).toBe("ⅻroman");
    });

    it("removes the combining mark that lowercasing a dotted I introduces", () => {
      // "İ".toLowerCase() is "i" + U+0307, and the strip has to take the mark
      // off. This is why both sides lowercase *before* stripping.
      expect(normalizeNameForIdentity("İstanbul")).toBe("istanbul");
    });
  });

  it("is idempotent", () => {
    for (const input of ["Kai'Sa, Survivor", "影流之主", "黯荧岛Dark Glow", "Владыка Теней"]) {
      expect(normalizeNameForIdentity(normalizeNameForIdentity(input))).toBe(
        normalizeNameForIdentity(input),
      );
    }
  });
});

describe("straightenApostrophes", () => {
  it("replaces curly apostrophes with straight ones", () => {
    expect(straightenApostrophes("Kai’Sa, Survivor")).toBe("Kai'Sa, Survivor");
  });

  it("replaces every occurrence", () => {
    expect(straightenApostrophes("don’t ’cause it’s")).toBe("don't 'cause it's");
  });

  it("leaves straight apostrophes unchanged", () => {
    expect(straightenApostrophes("Kai'Sa")).toBe("Kai'Sa");
  });

  it("leaves text without any apostrophes unchanged", () => {
    expect(straightenApostrophes("Fireball")).toBe("Fireball");
  });

  it("returns an empty string unchanged", () => {
    expect(straightenApostrophes("")).toBe("");
  });
});

describe("sortByLanguageAndCanonicalRank", () => {
  it("returns a new array — does not mutate input", () => {
    const input = [
      makePrinting({ id: "a", language: "EN", canonicalRank: 2 }),
      makePrinting({ id: "b", language: "EN", canonicalRank: 1 }),
    ];
    const output = sortByLanguageAndCanonicalRank(input, ["EN"]);
    expect(output).not.toBe(input);
    expect(input.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("bubbles preferred-language rows to the top", () => {
    const de = makePrinting({ id: "de", language: "DE", canonicalRank: 1 });
    const en = makePrinting({ id: "en", language: "EN", canonicalRank: 5 });
    expect(sortByLanguageAndCanonicalRank([de, en], ["EN", "DE"]).map((p) => p.id)).toEqual([
      "en",
      "de",
    ]);
  });

  it("preserves canonicalRank order within each language bucket", () => {
    const en1 = makePrinting({ id: "en1", language: "EN", canonicalRank: 10 });
    const en2 = makePrinting({ id: "en2", language: "EN", canonicalRank: 20 });
    const de1 = makePrinting({ id: "de1", language: "DE", canonicalRank: 5 });
    expect(sortByLanguageAndCanonicalRank([en2, de1, en1], ["EN", "DE"]).map((p) => p.id)).toEqual([
      "en1",
      "en2",
      "de1",
    ]);
  });

  it("sends unlisted-language rows to the bottom", () => {
    const en = makePrinting({ id: "en", language: "EN", canonicalRank: 10 });
    const sc = makePrinting({ id: "sc", language: "SC", canonicalRank: 1 });
    expect(sortByLanguageAndCanonicalRank([sc, en], ["EN"]).map((p) => p.id)).toEqual(["en", "sc"]);
  });
});

describe("toCents", () => {
  it("returns null for null input", () => {
    expect(toCents(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(toCents(undefined)).toBeNull();
  });

  it("returns null for zero", () => {
    expect(toCents(0)).toBeNull();
  });

  it("converts dollar amounts to cents", () => {
    expect(toCents(1.5)).toBe(150);
    expect(toCents(9.99)).toBe(999);
    expect(toCents(0.01)).toBe(1);
  });

  it("rounds fractional cents using Math.round", () => {
    // 1.005 * 100 = 100.49999... in IEEE 754, so Math.round gives 100
    expect(toCents(1.005)).toBe(100);
    // 0.1 + 0.2 = 0.30000000000000004, * 100 = 30.000000000000004, rounds to 30
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("handles negative amounts", () => {
    expect(toCents(-5.25)).toBe(-525);
  });
});

describe("centsToDollars", () => {
  it("returns null for null input", () => {
    expect(centsToDollars(null)).toBeNull();
  });

  it("converts cents to dollars", () => {
    expect(centsToDollars(150)).toBe(1.5);
    expect(centsToDollars(999)).toBe(9.99);
    expect(centsToDollars(1)).toBe(0.01);
  });

  it("converts zero cents to zero dollars", () => {
    expect(centsToDollars(0)).toBe(0);
  });

  it("handles negative cent values", () => {
    expect(centsToDollars(-525)).toBe(-5.25);
  });
});

describe("emptyToNull", () => {
  it("returns null for empty string", () => {
    expect(emptyToNull("")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(emptyToNull(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(emptyToNull(undefined)).toBeNull();
  });

  it("returns the string for non-empty input", () => {
    expect(emptyToNull("hello")).toBe("hello");
  });

  it("returns the string for whitespace-only input", () => {
    // Whitespace is truthy, so it passes through
    expect(emptyToNull("  ")).toBe("  ");
  });
});

describe("trimToNull", () => {
  it("returns null for whitespace-only input", () => {
    expect(trimToNull("   ")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(trimToNull("")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(trimToNull(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(trimToNull(undefined)).toBeNull();
  });

  it("trims surrounding whitespace but preserves inner spacing", () => {
    expect(trimToNull("  hello world  ")).toBe("hello world");
  });
});

describe("getOrientation", () => {
  it("returns landscape for Battlefield type", () => {
    expect(getOrientation(["battlefield"])).toBe("landscape");
  });

  it("returns portrait for Unit type", () => {
    expect(getOrientation(["unit"])).toBe("portrait");
  });

  it("returns portrait for Spell type", () => {
    expect(getOrientation(["spell"])).toBe("portrait");
  });

  it("returns portrait for Legend type", () => {
    expect(getOrientation(["legend"])).toBe("portrait");
  });

  it("returns portrait for Rune type", () => {
    expect(getOrientation(["rune"])).toBe("portrait");
  });

  it("returns portrait for Gear type", () => {
    expect(getOrientation(["gear"])).toBe("portrait");
  });
});

describe("mostCommonValue", () => {
  it("returns empty string for empty array", () => {
    expect(mostCommonValue([])).toBe("");
  });

  it("returns the single element for single-element array", () => {
    expect(mostCommonValue(["hello"])).toBe("hello");
  });

  it("returns the most frequent value", () => {
    expect(mostCommonValue(["a", "b", "a", "c", "a"])).toBe("a");
  });

  it("returns the first most-frequent value when tied", () => {
    expect(mostCommonValue(["a", "b", "b", "a"])).toBe("a");
  });

  it("handles all-same values", () => {
    expect(mostCommonValue(["x", "x", "x"])).toBe("x");
  });

  it("handles all-unique values (returns first)", () => {
    expect(mostCommonValue(["a", "b", "c"])).toBe("a");
  });
});

describe("compareWithLanguagePreference", () => {
  const enPrinting = makePrinting({ id: "en", language: "EN" });
  const scPrinting = makePrinting({ id: "sc", language: "SC" });

  it("prefers EN over SC with single-language preference ['EN']", () => {
    expect(compareWithLanguagePreference(enPrinting, scPrinting, ["EN"])).toBeLessThan(0);
    expect(compareWithLanguagePreference(scPrinting, enPrinting, ["EN"])).toBeGreaterThan(0);
  });

  it("prefers SC over EN with single-language preference ['SC']", () => {
    expect(compareWithLanguagePreference(scPrinting, enPrinting, ["SC"])).toBeLessThan(0);
    expect(compareWithLanguagePreference(enPrinting, scPrinting, ["SC"])).toBeGreaterThan(0);
  });

  it("prefers EN over SC with multi-language preference ['EN', 'SC']", () => {
    expect(compareWithLanguagePreference(enPrinting, scPrinting, ["EN", "SC"])).toBeLessThan(0);
  });

  it("returns 0 for same language with equal canonicalRank", () => {
    expect(compareWithLanguagePreference(enPrinting, enPrinting, ["EN"])).toBe(0);
  });

  it("sorts unlisted languages alphabetically after listed ones", () => {
    const dePrinting = makePrinting({ id: "de", language: "DE" });
    const frPrinting = makePrinting({ id: "fr", language: "FR" });
    // Preference is EN only — DE and FR are both unlisted, should sort alphabetically
    expect(compareWithLanguagePreference(dePrinting, frPrinting, ["EN"])).toBeLessThan(0);
    expect(compareWithLanguagePreference(frPrinting, dePrinting, ["EN"])).toBeGreaterThan(0);
  });

  it("uses canonicalRank as the tiebreaker when languages are equal", () => {
    const low = makePrinting({ id: "low", language: "EN", canonicalRank: 1 });
    const high = makePrinting({ id: "high", language: "EN", canonicalRank: 2 });
    expect(compareWithLanguagePreference(low, high, ["EN"])).toBeLessThan(0);
    expect(compareWithLanguagePreference(high, low, ["EN"])).toBeGreaterThan(0);
  });
});

describe("deduplicateByCard", () => {
  it("picks EN printing when language preference is ['EN']", () => {
    const enPrinting = makePrinting({ id: "en", language: "EN" });
    const scPrinting = makePrinting({ id: "sc", language: "SC" });
    // SC first in array to prove deduplication respects preference, not insertion order
    const result = deduplicateByCard([scPrinting, enPrinting], ["EN"]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("en");
  });

  it("picks SC printing when language preference is ['SC']", () => {
    const enPrinting = makePrinting({ id: "en", language: "EN" });
    const scPrinting = makePrinting({ id: "sc", language: "SC" });
    const result = deduplicateByCard([enPrinting, scPrinting], ["SC"]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sc");
  });
});

describe("preferredPrinting", () => {
  it("returns EN printing with single-language preference ['EN']", () => {
    const enPrinting = makePrinting({ id: "en", language: "EN" });
    const scPrinting = makePrinting({ id: "sc", language: "SC" });
    const result = preferredPrinting([scPrinting, enPrinting], ["EN"]);
    expect(result?.id).toBe("en");
  });

  it("returns undefined for empty array", () => {
    expect(preferredPrinting([], ["EN"])).toBeUndefined();
  });
});

describe("capitalize", () => {
  it("uppercases the first character", () => {
    expect(capitalize("regions")).toBe("Regions");
  });

  it("leaves an empty string alone", () => {
    expect(capitalize("")).toBe("");
  });
});

describe("sentenceCaseSlug", () => {
  it("capitalizes only the first word", () => {
    expect(sentenceCaseSlug("constructed")).toBe("Constructed");
    expect(sentenceCaseSlug("custom-region")).toBe("Custom region");
  });

  it("treats underscores as word separators too", () => {
    expect(sentenceCaseSlug("custom_region")).toBe("Custom region");
  });

  it("drops empty segments from a doubled or trailing separator", () => {
    expect(sentenceCaseSlug("custom--region-")).toBe("Custom region");
  });
});

describe("titleCaseSlug", () => {
  it("capitalizes every word of a hyphenated slug", () => {
    expect(titleCaseSlug("proving-grounds")).toBe("Proving Grounds");
  });

  // The finish slugs are hyphenated, so an underscore-only split rendered
  // WellKnown.finish.METAL_DELUXE as "Metal-deluxe" on list exports.
  it("capitalizes every word of an underscored slug", () => {
    expect(titleCaseSlug("rainbow_foil")).toBe("Rainbow Foil");
    expect(titleCaseSlug("metal-deluxe")).toBe("Metal Deluxe");
  });

  it("returns an empty string for an empty slug", () => {
    expect(titleCaseSlug("")).toBe("");
  });
});

describe("truncateWithEllipsis", () => {
  it("leaves text within the budget untouched", () => {
    expect(truncateWithEllipsis("Yasuo", 10)).toBe("Yasuo");
    expect(truncateWithEllipsis("Yasuo", 5)).toBe("Yasuo");
  });

  it("counts the ellipsis against the budget", () => {
    expect(truncateWithEllipsis("Yasuo", 4)).toBe("Yas…");
  });

  it("trims trailing space before the ellipsis", () => {
    expect(truncateWithEllipsis("Yasuo Unforgiven", 7)).toBe("Yasuo…");
  });

  it("returns an empty string for a non-positive budget", () => {
    expect(truncateWithEllipsis("Yasuo", 0)).toBe("");
    expect(truncateWithEllipsis("Yasuo", -1)).toBe("");
  });
});

describe("labelMap", () => {
  it("keys rows by slug in input order", () => {
    const map = labelMap([
      { slug: "foil", label: "Foil" },
      { slug: "metal-deluxe", label: "Metal Deluxe" },
    ]);
    expect(map).toEqual({ foil: "Foil", "metal-deluxe": "Metal Deluxe" });
    expect(Object.keys(map)).toEqual(["foil", "metal-deluxe"]);
  });

  it("returns an empty object for no rows", () => {
    expect(labelMap([])).toEqual({});
  });
});

describe("formatCents", () => {
  it("renders minor units as major-unit currency", () => {
    expect(formatCents(452, "USD")).toBe("$4.52");
    expect(formatCents(380, "EUR")).toBe("€3.80");
    expect(formatCents(0, "USD")).toBe("$0.00");
  });

  it("groups thousands and keeps two decimals", () => {
    expect(formatCents(123_456, "USD")).toBe("$1,234.56");
  });
});
