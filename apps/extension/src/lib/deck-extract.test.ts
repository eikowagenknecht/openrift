import { describe, expect, it, vi } from "vitest";

import {
  extractDeckFromPage,
  extractSectionedListDecklist,
  extractTableDecklist,
  findDeckCode,
} from "./deck-extract";

// The code literal is repeated inside the factory because vi.mock is
// hoisted above any const declaration.
vi.mock("@piltoverarchive/riftbound-deck-codes", () => ({
  getDeckFromCode: vi.fn((code: string) => {
    if (code === "CEBAGAYDAMBQGE") {
      return { mainDeck: [{ cardCode: "OGN-001", count: 3 }], sideboard: [] };
    }
    throw new Error("invalid code");
  }),
}));

const VALID_CODE = "CEBAGAYDAMBQGE";

function documentFrom(bodyHtml: string): Document {
  return new DOMParser().parseFromString(`<html><body>${bodyHtml}</body></html>`, "text/html");
}

function cardRow(quantity: number, slug: string, name: string): string {
  return `<tr class="card-list-item">
    <td style="width:20px"><b>${quantity}&nbsp;</b></td>
    <td><a href="/cards/details-${slug}">
      ${name}
    </a></td>
    <td><span>$0.29</span></td>
  </tr>`;
}

function groupRow(label: string, count: number): string {
  return `<tr><td colspan="3"><div class="subheader text-white mb-2">&nbsp; ${label} (${count})</div></td></tr>`;
}

const FULL_DECK_TABLE = `<table><tbody>
  ${groupRow("legend", 1)}
  ${cardRow(1, "diana-scorn-of-the-moon", "Diana, Scorn of the Moon")}
  ${groupRow("champion", 1)}
  ${cardRow(1, "diana-lunari", "Diana, Lunari")}
  ${groupRow("unit", 6)}
  ${cardRow(3, "ravenbloom-student", "Ravenbloom Student")}
  ${cardRow(3, "tideturner", "Tideturner")}
  ${groupRow("spell", 3)}
  ${cardRow(3, "stacked-deck", "Stacked Deck")}
  ${groupRow("battlefields", 1)}
  ${cardRow(1, "targons-peak", "Targon's Peak")}
  ${groupRow("runes", 12)}
  ${cardRow(7, "chaos-rune", "Chaos Rune")}
  ${cardRow(5, "mind-rune", "Mind Rune")}
  ${groupRow("sideboard", 2)}
  ${cardRow(2, "singularity", "Singularity")}
</tbody></table>`;

describe("extractTableDecklist", () => {
  it("rebuilds a grouped decklist table as the text format", () => {
    const doc = documentFrom(FULL_DECK_TABLE);

    expect(extractTableDecklist(doc)).toBe(
      [
        "Legend:",
        "1 Diana, Scorn of the Moon",
        "",
        "Champion:",
        "1 Diana, Lunari",
        "",
        "MainDeck:",
        "3 Ravenbloom Student",
        "3 Tideturner",
        "3 Stacked Deck",
        "",
        "Battlefields:",
        "1 Targon's Peak",
        "",
        "Runes:",
        "7 Chaos Rune",
        "5 Mind Rune",
        "",
        "Sideboard:",
        "2 Singularity",
      ].join("\n"),
    );
  });

  it("folds unknown group labels into the main deck", () => {
    const doc = documentFrom(`<table>
      ${groupRow("gear", 2)}
      ${cardRow(2, "prototype-blade", "Prototype Blade")}
    </table>`);

    expect(extractTableDecklist(doc)).toBe("MainDeck:\n2 Prototype Blade");
  });

  it("defaults a missing quantity cell to one copy", () => {
    const doc = documentFrom(`<table>
      ${groupRow("legend", 1)}
      <tr class="card-list-item"><td><a href="/cards/details-ekko">Ekko</a></td></tr>
    </table>`);

    expect(extractTableDecklist(doc)).toBe("Legend:\n1 Ekko");
  });

  it("ignores tables without group subheaders", () => {
    const doc = documentFrom(`<table>
      ${cardRow(3, "some-card", "Some Card")}
    </table>`);

    expect(extractTableDecklist(doc)).toBeNull();
  });

  it("picks the table with the most cards when several qualify", () => {
    const doc = documentFrom(`
      <table>${groupRow("sideboard", 1)}${cardRow(1, "stray", "Stray Card")}</table>
      ${FULL_DECK_TABLE}
    `);

    expect(extractTableDecklist(doc)).toContain("Diana, Scorn of the Moon");
  });

  it("skips rows without a card link and collapses name whitespace", () => {
    const doc = documentFrom(`<table>
      ${groupRow("unit", 1)}
      <tr class="card-list-item"><td><b>9&nbsp;</b></td><td>no link here</td></tr>
      ${cardRow(3, "hwei-brooding-painter", "Hwei,\n      Brooding Painter")}
    </table>`);

    expect(extractTableDecklist(doc)).toBe("MainDeck:\n3 Hwei, Brooding Painter");
  });
});

function listRow(quantity: number, name: string): string {
  return `<div class="card-name-text"><span class="me-2">${quantity}</span><span>${name}</span></div>`;
}

const SECTIONED_LIST = `
  <div class="section-header"><span>Champion (1)</span></div>
  ${listRow(1, "Irelia, Blade Dancer")}
  <div class="section-header"><span>Mainboard (13)</span></div>
  ${listRow(6, "Calm Rune")}
  ${listRow(1, "Targon's Peak")}
  ${listRow(3, "Scuttle Crab")}
  ${listRow(3, "Defy")}
  <div class="section-header"><span>Sideboard (2)</span></div>
  ${listRow(2, "Adaptatron")}
`;

describe("extractSectionedListDecklist", () => {
  it("emits unheadered lines with an explicit sideboard section", () => {
    const doc = documentFrom(SECTIONED_LIST);

    expect(extractSectionedListDecklist(doc)).toBe(
      [
        "1 Irelia, Blade Dancer",
        "6 Calm Rune",
        "1 Targon's Peak",
        "3 Scuttle Crab",
        "3 Defy",
        "",
        "Sideboard:",
        "2 Adaptatron",
      ].join("\n"),
    );
  });

  it("omits the sideboard section when the page has none", () => {
    const doc = documentFrom(`
      <div class="section-header"><span>Mainboard (3)</span></div>
      ${listRow(3, "Defy")}
    `);

    expect(extractSectionedListDecklist(doc)).toBe("3 Defy");
  });

  it("returns null without section headers", () => {
    const doc = documentFrom(listRow(3, "Defy"));

    expect(extractSectionedListDecklist(doc)).toBeNull();
  });

  it("skips rows whose first span is not a quantity", () => {
    const doc = documentFrom(`
      <div class="section-header"><span>Mainboard (1)</span></div>
      <div class="card-name-text"><span>Record:</span><span>6-1-0</span></div>
      ${listRow(2, "Charm")}
    `);

    expect(extractSectionedListDecklist(doc)).toBe("2 Charm");
  });
});

describe("findDeckCode", () => {
  it("finds a valid deck code in a query parameter", () => {
    const doc = documentFrom("<p>nothing here</p>");

    expect(findDeckCode(doc, `https://example.com/builder?deck=${VALID_CODE}`)).toBe(VALID_CODE);
  });

  it("finds a valid deck code in a code element", () => {
    const doc = documentFrom(`<code>${VALID_CODE}</code>`);

    expect(findDeckCode(doc, "https://example.com/page")).toBe(VALID_CODE);
  });

  it("finds a valid deck code in a readonly input", () => {
    const doc = documentFrom(`<input readonly value="${VALID_CODE}">`);

    expect(findDeckCode(doc, "https://example.com/page")).toBe(VALID_CODE);
  });

  it("rejects plausible-looking tokens that fail decoding", () => {
    const doc = documentFrom("<code>DECKBUILDINGCODE</code>");

    expect(findDeckCode(doc, "https://example.com/deckbuilding/page")).toBeNull();
  });

  it("finds a deck code in a relative link target", () => {
    const doc = documentFrom(`<a href="/builder?code=${VALID_CODE}">Open in builder</a>`);

    expect(findDeckCode(doc, "https://example.com/decks/view/some-uuid")).toBe(VALID_CODE);
  });

  it("finds a deck code in an element with code in its class name", () => {
    const doc = documentFrom(`<div class="deck-data-code" hidden>${VALID_CODE}</div>`);

    expect(findDeckCode(doc, "https://example.com/decks/some-deck/")).toBe(VALID_CODE);
  });
});

describe("extractDeckFromPage", () => {
  it("prefers the structured decklist over an embedded code", () => {
    const doc = documentFrom(`${FULL_DECK_TABLE}<code>${VALID_CODE}</code>`);

    const result = extractDeckFromPage(doc, "https://example.com/deck");

    expect(result.kind).toBe("text");
  });

  it("carries the page heading as the deck name", () => {
    const doc = documentFrom(`<h1>Diana, Scorn of the Moon\n  by Player</h1>${FULL_DECK_TABLE}`);

    const result = extractDeckFromPage(doc, "https://example.com/deck");

    expect(result).toMatchObject({ kind: "text", name: "Diana, Scorn of the Moon by Player" });
  });

  it("omits the deck name when the page has no heading", () => {
    const doc = documentFrom(FULL_DECK_TABLE);

    const result = extractDeckFromPage(doc, "https://example.com/deck");

    expect(result.kind).toBe("text");
    expect((result as { name?: string }).name).toBeUndefined();
  });

  it("falls back to a deck code when no decklist table exists", () => {
    const doc = documentFrom(`<h1>Hook Leblanc</h1><code>${VALID_CODE}</code>`);

    expect(extractDeckFromPage(doc, "https://example.com/page")).toEqual({
      kind: "code",
      code: VALID_CODE,
      name: "Hook Leblanc",
    });
  });

  it("reports none when the page has neither", () => {
    const doc = documentFrom("<p>a plain article</p>");

    expect(extractDeckFromPage(doc, "https://example.com/article")).toEqual({ kind: "none" });
  });
});
