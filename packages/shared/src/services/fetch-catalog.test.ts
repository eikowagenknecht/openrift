import { afterEach, describe, expect, it } from "bun:test";

import type { Logger } from "../logger";
import {
  deriveArtVariant,
  fetchCatalog,
  parseKeywords,
  stripHtml,
  toBaseSourceId,
} from "./fetch-catalog";

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

  it("decodes decimal numeric entities", () => {
    expect(stripHtml("hello&#8212;world")).toBe("hello\u2014world");
  });

  it("decodes hex numeric entities", () => {
    expect(stripHtml("it&#x2019;s fine")).toBe("it\u2019s fine");
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

// ---------------------------------------------------------------------------
// fetchCatalog
// ---------------------------------------------------------------------------

// -- Mock data modelled on the real gallery page structure ------------------

function makeGalleryCard(overrides: Record<string, unknown> = {}) {
  return {
    collectorNumber: 1,
    id: "ogn-001-100",
    name: "Fire Knight",
    set: { label: "Card Set", value: { id: "OGN", label: "Origins" } },
    domain: { label: "Domain", values: [{ id: "fury", label: "Fury" }] },
    rarity: { label: "Rarity", value: { id: "common", label: "Common" } },
    cardType: { label: "Card Type", type: [{ id: "unit", label: "Unit" }] },
    cardImage: { url: "https://img.example.com/fire-knight.jpg" },
    illustrator: { label: "Artist", values: [{ id: "alice", label: "Alice" }] },
    text: {
      label: "Ability",
      richText: { type: "html", body: "<p>[Shield] Guard the line.</p>" },
    },
    orientation: "portrait",
    publicCode: "OGN-001/100",
    energy: { label: "Energy", value: { id: 3, label: "3" } },
    might: { label: "Might", value: { id: 2, label: "2" } },
    power: { label: "Power", value: { id: 4, label: "4" } },
    ...overrides,
  };
}

const MOCK_CARDS = [
  // SFD card listed first so we can verify set sorting (Origins should come before Spiritforged)
  makeGalleryCard({
    collectorNumber: 10,
    id: "sfd-010-80",
    name: "Warden",
    set: { label: "Card Set", value: { id: "SFD", label: "Spiritforged" } },
    domain: {
      label: "Domain",
      values: [
        { id: "calm", label: "Calm" },
        { id: "order", label: "Order" },
      ],
    },
    rarity: { label: "Rarity", value: { id: "rare", label: "Rare" } },
    cardType: {
      label: "Card Type",
      type: [{ id: "unit", label: "Unit" }],
      superType: [{ id: "champion", label: "Champion" }],
    },
    cardImage: { url: "https://img.example.com/warden.jpg" },
    illustrator: { label: "Artist", values: [{ id: "dave", label: "Dave" }] },
    text: {
      label: "Ability",
      richText: { type: "html", body: "[Quick-Strike] Attack first." },
    },
    publicCode: "SFD-010/80",
    energy: { label: "Energy", value: { id: 5, label: "5" } },
    might: { label: "Might", value: { id: 4, label: "4" } },
    power: { label: "Power", value: { id: 6, label: "6" } },
    mightBonus: { label: "Might Bonus", value: { id: 1, label: "+1" } },
    tags: { label: "Tags", tags: ["Warrior"] },
  }),
  // Normal printing
  makeGalleryCard(),
  // Alt art of the same card
  makeGalleryCard({
    id: "ogn-001a-100",
    publicCode: "OGN-001a/100",
    cardImage: { url: "https://img.example.com/fire-knight-alt.jpg" },
    illustrator: { label: "Artist", values: [{ id: "bob", label: "Bob" }] },
  }),
  // Signed variant — overnumbered like real data (collectorNumber > printedTotal)
  makeGalleryCard({
    collectorNumber: 105,
    id: "ogn-105-star-100",
    publicCode: "OGN-105*/100",
    cardImage: { url: "https://img.example.com/fire-knight-signed.jpg" },
    illustrator: { label: "Artist", values: [{ id: "alice", label: "Alice" }] },
  }),
  // Spell — no might/power, has effect
  makeGalleryCard({
    collectorNumber: 50,
    id: "ogn-050-100",
    name: "Arcane Blast",
    rarity: { label: "Rarity", value: { id: "uncommon", label: "Uncommon" } },
    cardType: { label: "Card Type", type: [{ id: "spell", label: "Spell" }] },
    domain: { label: "Domain", values: [{ id: "mind", label: "Mind" }] },
    cardImage: { url: "https://img.example.com/arcane-blast.jpg" },
    illustrator: { label: "Artist", values: [{ id: "carol", label: "Carol" }] },
    text: {
      label: "Ability",
      richText: { type: "html", body: "Deal 3 damage to target unit." },
    },
    publicCode: "OGN-050/100",
    energy: { label: "Energy", value: { id: 2, label: "2" } },
    might: undefined,
    power: undefined,
    effect: {
      label: "Effect",
      richText: { type: "html", body: "If [Burn] was triggered, deal 1 more." },
    },
  }),
];

function buildGalleryHtml(items: unknown[]) {
  const nextData = {
    props: {
      pageProps: {
        page: {
          blades: [{ type: "textMasthead" }, { type: "riftboundCardGallery", cards: { items } }],
        },
      },
    },
  };
  return `<html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></head><body></body></html>`;
}

function mockFetchWith(html: string) {
  globalThis.fetch = (async () => new Response(html, { status: 200 })) as unknown as typeof fetch;
}

// oxlint-disable-next-line no-empty-function -- noop logger for tests
const noop = () => {};

function makeMockLogger(): Logger {
  return { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;
}

describe("fetchCatalog", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -- Error cases --

  it("throws on non-OK HTTP response", async () => {
    globalThis.fetch = (async () =>
      new Response("Service Unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      })) as unknown as typeof fetch;

    await expect(fetchCatalog(makeMockLogger())).rejects.toThrow("HTTP 503");
  });

  it("throws when __NEXT_DATA__ script tag is missing", async () => {
    mockFetchWith("<html><body>No data here</body></html>");

    await expect(fetchCatalog(makeMockLogger())).rejects.toThrow(
      "Could not find __NEXT_DATA__ script tag",
    );
  });

  it("throws when __NEXT_DATA__ contains malformed JSON", async () => {
    mockFetchWith('<script id="__NEXT_DATA__" type="application/json">{invalid json</script>');

    await expect(fetchCatalog(makeMockLogger())).rejects.toThrow(
      "Malformed JSON in __NEXT_DATA__ script tag",
    );
  });

  it("throws when riftboundCardGallery blade is missing", async () => {
    const nextData = { props: { pageProps: { page: { blades: [{ type: "other" }] } } } };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
    mockFetchWith(html);

    await expect(fetchCatalog(makeMockLogger())).rejects.toThrow(
      "Could not find riftboundCardGallery blade",
    );
  });

  // -- Success case --

  it("parses gallery HTML into sets, game cards, and printings", async () => {
    mockFetchWith(buildGalleryHtml(MOCK_CARDS));

    const result = await fetchCatalog(makeMockLogger());

    // Sets are sorted: Origins before Spiritforged (canonical order)
    expect(result.sets).toEqual([
      { id: "OGN", name: "Origins", printedTotal: 100 },
      { id: "SFD", name: "Spiritforged", printedTotal: 80 },
    ]);

    // 3 unique game cards (Fire Knight normal + alt + signed → 1 game card)
    const cardIds = Object.keys(result.cards);
    expect(cardIds).toHaveLength(3);
    expect(cardIds).toContain("OGN-001");
    expect(cardIds).toContain("OGN-050");
    expect(cardIds).toContain("SFD-010");

    // 5 printings total (Fire Knight has normal, alt, and signed)
    expect(result.printings).toHaveLength(5);
  });

  it("converts a unit card with stats and keywords from HTML", async () => {
    mockFetchWith(buildGalleryHtml(MOCK_CARDS));
    const result = await fetchCatalog(makeMockLogger());

    const fireKnight = result.cards["OGN-001"];
    expect(fireKnight.name).toBe("Fire Knight");
    expect(fireKnight.type).toBe("Unit");
    expect(fireKnight.superTypes).toEqual([]);
    expect(fireKnight.domains).toEqual(["Fury"]);
    expect(fireKnight.stats).toEqual({ might: 2, energy: 3, power: 4 });
    expect(fireKnight.keywords).toEqual(["Shield"]);
    expect(fireKnight.rulesText).toBe("[Shield] Guard the line.");
    expect(fireKnight.effectText).toBe("");
    expect(fireKnight.mightBonus).toBeNull();
    expect(fireKnight.tags).toEqual([]);
  });

  it("converts a champion unit with superType, tags, and mightBonus", async () => {
    mockFetchWith(buildGalleryHtml(MOCK_CARDS));
    const result = await fetchCatalog(makeMockLogger());

    const warden = result.cards["SFD-010"];
    expect(warden.name).toBe("Warden");
    expect(warden.type).toBe("Unit");
    expect(warden.superTypes).toEqual(["Champion"]);
    expect(warden.domains).toEqual(["Calm", "Order"]);
    expect(warden.stats).toEqual({ might: 4, energy: 5, power: 6 });
    expect(warden.keywords).toEqual(["Quick-Strike"]);
    expect(warden.mightBonus).toBe(1);
    expect(warden.tags).toEqual(["Warrior"]);
  });

  it("converts a spell with null stats and an effect field", async () => {
    mockFetchWith(buildGalleryHtml(MOCK_CARDS));
    const result = await fetchCatalog(makeMockLogger());

    const blast = result.cards["OGN-050"];
    expect(blast.name).toBe("Arcane Blast");
    expect(blast.type).toBe("Spell");
    expect(blast.stats).toEqual({ might: null, energy: 2, power: null });
    expect(blast.rulesText).toBe("Deal 3 damage to target unit.");
    expect(blast.effectText).toBe("If [Burn] was triggered, deal 1 more.");
    expect(blast.keywords).toEqual(["Burn"]);
  });

  it("assigns correct art variants to printings", async () => {
    mockFetchWith(buildGalleryHtml(MOCK_CARDS));
    const result = await fetchCatalog(makeMockLogger());

    const bySourceId = new Map(result.printings.map((p) => [p.sourceId, p]));

    const normal = bySourceId.get("OGN-001");
    expect(normal?.artVariant).toBe("normal");
    expect(normal?.isSigned).toBe(false);
    expect(normal?.art.artist).toBe("Alice");

    const alt = bySourceId.get("OGN-001a");
    expect(alt?.artVariant).toBe("altart");
    expect(alt?.isSigned).toBe(false);
    expect(alt?.art.artist).toBe("Bob");

    // Both map to the same game card
    expect(normal?.cardId).toBe("OGN-001");
    expect(alt?.cardId).toBe("OGN-001");
  });

  it("marks signed printings with isSigned and high scoring so normal is preferred", async () => {
    mockFetchWith(buildGalleryHtml(MOCK_CARDS));
    const result = await fetchCatalog(makeMockLogger());

    const signed = result.printings.find((p) => p.sourceId === "OGN-105*");
    expect(signed).toBeDefined();
    expect(signed?.isSigned).toBe(true);
    expect(signed?.artVariant).toBe("overnumbered");
    expect(signed?.cardId).toBe("OGN-001");

    // The base game card should still be the unsigned normal printing
    expect(result.cards["OGN-001"]).toBeDefined();
  });

  it("picks the normal printing as the base game card over alt art", async () => {
    // If we only had the alt art, the game card key would be "OGN-001" (toBaseSourceId strips "a")
    mockFetchWith(buildGalleryHtml(MOCK_CARDS));
    const result = await fetchCatalog(makeMockLogger());

    // The game card for Fire Knight uses the normal printing's data (Alice, not Bob)
    expect(result.cards["OGN-001"]).toBeDefined();
    expect(result.cards["OGN-001a"]).toBeUndefined();
  });

  it("continues with valid cards when some fail schema validation", async () => {
    const invalidCard = { name: "Bad Card", collectorNumber: "not-a-number" };
    const items = [...MOCK_CARDS, invalidCard];
    mockFetchWith(buildGalleryHtml(items));

    const warnings: string[] = [];
    const log = {
      ...makeMockLogger(),
      warn: (msg: string) => warnings.push(msg),
    } as unknown as Logger;

    const result = await fetchCatalog(log);

    // Valid cards still processed
    expect(result.printings).toHaveLength(5);
    // Warning logged about the invalid card
    expect(warnings.some((w) => w.includes("1 cards failed validation"))).toBe(true);
  });

  it("truncates validation warnings when more than 5 cards fail", async () => {
    const invalidCards = Array.from({ length: 7 }, (_, i) => ({
      name: `Bad ${i}`,
      collectorNumber: "nope",
    }));
    const items = [...MOCK_CARDS, ...invalidCards];
    mockFetchWith(buildGalleryHtml(items));

    const warnings: string[] = [];
    const log = {
      ...makeMockLogger(),
      warn: (msg: string) => warnings.push(msg),
    } as unknown as Logger;

    await fetchCatalog(log);

    expect(warnings.some((w) => w.includes("7 cards failed validation"))).toBe(true);
    expect(warnings.some((w) => w.includes("...and 2 more"))).toBe(true);
  });

  it("populates printing metadata correctly", async () => {
    mockFetchWith(buildGalleryHtml(MOCK_CARDS));
    const result = await fetchCatalog(makeMockLogger());

    const blast = result.printings.find((p) => p.sourceId === "OGN-050");
    expect(blast).toBeDefined();
    expect(blast?.set).toBe("OGN");
    expect(blast?.collectorNumber).toBe(50);
    expect(blast?.rarity).toBe("Uncommon");
    expect(blast?.isPromo).toBe(false);
    expect(blast?.publicCode).toBe("OGN-050/100");
    expect(blast?.printedRulesText).toBe("Deal 3 damage to target unit.");
    expect(blast?.printedEffectText).toBe("If [Burn] was triggered, deal 1 more.");
  });
});
