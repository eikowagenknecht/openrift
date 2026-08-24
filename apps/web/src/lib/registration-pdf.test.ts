import type { DeckZone } from "@openrift/shared";
import { SIDEBOARD_MAXIMUM, WellKnown } from "@openrift/shared";
import type { jsPDF, jsPDFOptions } from "jspdf";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { stubDeckBuilderCard } from "@/test/factories";

import type { RegistrationFields, RegistrationPageSize } from "./registration-pdf";
import { generateRegistrationPdf } from "./registration-pdf";

// ── A recording stand-in for jsPDF ─────────────────────────────────────────
//
// The sheet is pure layout, so the tests assert on the drawing calls the module
// makes rather than on the PDF bytes. Every call keeps the font/colour state it
// was issued under, which is what distinguishes a bold header row from a normal
// card row drawn in the same column.

interface DrawState {
  font: string;
  style: string;
  size: number;
  color: string;
}

interface TextCall extends DrawState {
  text: string;
  x: number;
  y: number;
  angle?: number;
  align?: string;
}

interface LineCall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lineWidth: number;
}

interface RectCall {
  x: number;
  y: number;
  width: number;
  height: number;
  lineWidth: number;
}

interface ImageCall {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LinkCall {
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
}

interface FakeDoc {
  options: jsPDFOptions;
  texts: TextCall[];
  lines: LineCall[];
  rects: RectCall[];
  images: ImageCall[];
  links: LinkCall[];
  saved: string[];
  setFont: (font: string, style: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  setLineWidth: (width: number) => void;
  text: (value: string, x: number, y: number, options?: { angle?: number; align?: string }) => void;
  getTextWidth: (value: string) => number;
  rect: (x: number, y: number, width: number, height: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addImage: (
    dataUrl: string,
    format: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  link: (x: number, y: number, width: number, height: number, options: { url: string }) => void;
  save: (filename: string) => void;
}

const mocks = vi.hoisted(() => {
  const docs: FakeDoc[] = [];
  const addImageFails = { value: false };
  const loadLogo = vi.fn<() => Promise<string>>();

  function createFakeDoc(options: jsPDFOptions): FakeDoc {
    const state: DrawState = { font: "helvetica", style: "normal", size: 12, color: "0,0,0" };
    let lineWidth = 0.2;

    const doc: FakeDoc = {
      options,
      texts: [],
      lines: [],
      rects: [],
      images: [],
      links: [],
      saved: [],
      setFont: (font, style) => {
        state.font = font;
        state.style = style;
      },
      setFontSize: (size) => {
        state.size = size;
      },
      setTextColor: (r, g, b) => {
        state.color = `${r},${g},${b}`;
      },
      setDrawColor: () => {
        // Stroke colour is not asserted on; the calls are accepted and dropped.
      },
      setLineWidth: (width) => {
        lineWidth = width;
      },
      text: (value, x, y, textOptions) => {
        doc.texts.push({
          ...state,
          text: value,
          x,
          y,
          angle: textOptions?.angle,
          align: textOptions?.align,
        });
      },
      // Stand-in for jsPDF's measurer: width grows with characters and font size.
      getTextWidth: (value) => value.length * state.size * 0.35,
      rect: (x, y, width, height) => {
        doc.rects.push({ x, y, width, height, lineWidth });
      },
      line: (x1, y1, x2, y2) => {
        doc.lines.push({ x1, y1, x2, y2, lineWidth });
      },
      addImage: (dataUrl, _format, x, y, width, height) => {
        if (addImageFails.value) {
          throw new Error("unsupported image");
        }
        doc.images.push({ dataUrl, x, y, width, height });
      },
      link: (x, y, width, height, linkOptions) => {
        doc.links.push({ x, y, width, height, url: linkOptions.url });
      },
      save: (filename) => {
        doc.saved.push(filename);
      },
    };

    return doc;
  }

  return { docs, addImageFails, loadLogo, createFakeDoc };
});

vi.mock("@/lib/pdf-document", () => ({
  createPdfDocument: (options: jsPDFOptions) => {
    const doc = mocks.createFakeDoc(options);
    mocks.docs.push(doc);
    return doc as unknown as jsPDF;
  },
}));

vi.mock("@/lib/pdf-logo", () => ({
  loadLogoDataUrl: () => mocks.loadLogo(),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const LOGO_DATA_URL = "data:image/png;base64,LOGO";
const SITE_URL = "https://openrift.app";

const EMPTY_FIELDS: RegistrationFields = {
  deckName: "",
  deckDesigner: "",
  firstName: "",
  lastName: "",
  riotId: "",
  eventDate: "",
  eventName: "",
  eventLocation: "",
};

function stubFields(overrides: Partial<RegistrationFields> = {}): RegistrationFields {
  return {
    deckName: "Piltover Tempo",
    deckDesigner: "Ravi Chandra",
    firstName: "Ravi",
    lastName: "Lightshield",
    riotId: "Lightshield#EUW",
    eventDate: "2026-08-15",
    eventName: "Summoner Skirmish",
    eventLocation: "Piltover Game Hall",
    ...overrides,
  };
}

function zoneCard(name: string, zone: DeckZone, quantity = 1): DeckBuilderCard {
  return stubDeckBuilderCard({ cardName: name, zone, quantity });
}

async function render(
  options: {
    fields?: RegistrationFields;
    cards?: DeckBuilderCard[];
    pageSize?: RegistrationPageSize;
    siteUrl?: string;
  } = {},
): Promise<FakeDoc> {
  await generateRegistrationPdf(
    options.fields ?? stubFields(),
    options.cards ?? [],
    options.pageSize ?? "a4",
    options.siteUrl ?? SITE_URL,
  );
  const doc = mocks.docs.at(-1);
  if (!doc) {
    throw new Error("no document was created");
  }
  return doc;
}

// ── Query helpers ──────────────────────────────────────────────────────────

function textsOf(doc: FakeDoc, value: string): TextCall[] {
  return doc.texts.filter((call) => call.text === value);
}

function onlyText(doc: FakeDoc, value: string): TextCall {
  const found = textsOf(doc, value);
  expect(found).toHaveLength(1);
  return found[0];
}

const BELOW_EVERYTHING = Number.POSITIVE_INFINITY;

// Card names written into a column's name cells, top to bottom. Header rows are
// bold and the footer/annotations use other sizes, so body rows are the normal
// 9pt runs at the name column's x.
function rowNames(doc: FakeDoc, columnX: number, fromY: number, toY: number): string[] {
  return doc.texts
    .filter(
      (call) =>
        call.x === columnX + 18 &&
        call.style === "normal" &&
        call.size === 9 &&
        call.y > fromY &&
        call.y < toY,
    )
    .map((call) => call.text);
}

// The legend and battlefield blocks have no quantity cell, so their names sit
// at the column's own x rather than 18 mm into it.
function nameOnlyRowNames(doc: FakeDoc, columnX: number, fromY: number, toY: number): string[] {
  return doc.texts
    .filter(
      (call) =>
        call.x === columnX &&
        call.style === "normal" &&
        call.size === 9 &&
        call.y > fromY &&
        call.y < toY,
    )
    .map((call) => call.text);
}

function rowQuantities(doc: FakeDoc, columnX: number, fromY: number, toY: number): string[] {
  return doc.texts
    .filter(
      (call) =>
        call.x === columnX + 6 &&
        call.align === "center" &&
        call.size === 9 &&
        call.y > fromY &&
        call.y < toY,
    )
    .map((call) => call.text);
}

// One quantity/name row draws a short underline under the quantity cell, so
// counting those counts printed rows whether or not a card filled them.
function rowCount(doc: FakeDoc, columnX: number, fromY: number, toY: number): number {
  return doc.lines.filter(
    (line) =>
      line.lineWidth === 0.15 &&
      line.x1 === columnX &&
      line.x2 === columnX + 12 &&
      line.y1 > fromY &&
      line.y1 < toY,
  ).length;
}

beforeEach(() => {
  mocks.docs.length = 0;
  mocks.addImageFails.value = false;
  mocks.loadLogo.mockReset();
  mocks.loadLogo.mockResolvedValue(LOGO_DATA_URL);
});

describe("generateRegistrationPdf", () => {
  describe("document setup", () => {
    it("asks for a portrait millimetre page in the requested size", async () => {
      const a4 = await render({ pageSize: "a4" });
      expect(a4.options).toEqual({ orientation: "portrait", unit: "mm", format: "a4" });

      const letter = await render({ pageSize: "letter" });
      expect(letter.options).toEqual({ orientation: "portrait", unit: "mm", format: "letter" });
    });

    it("saves the sheet exactly once", async () => {
      const doc = await render();
      expect(doc.saved).toEqual(["Piltover-Tempo-registration.pdf"]);
    });
  });

  describe("header", () => {
    it("prints the title and the print-clearly banner", async () => {
      const doc = await render();
      expect(onlyText(doc, "DECK REGISTRATION SHEET").style).toBe("bold");
      expect(textsOf(doc, "PRINT CLEARLY USING ENGLISH CARD NAMES")).toHaveLength(1);
    });

    it("brands the sheet with the deploy's own host and links to it", async () => {
      const doc = await render({ siteUrl: "https://preview.openrift.app" });
      const brand = onlyText(doc, "Generated with preview.openrift.app");
      expect(doc.links).toHaveLength(1);
      expect(doc.links[0].url).toBe("https://preview.openrift.app");
      // The hit area sits on the brand line.
      expect(doc.links[0].y).toBeCloseTo(brand.y - 2);
    });

    it("embeds the logo returned by the loader", async () => {
      const doc = await render();
      expect(doc.images).toEqual([{ dataUrl: LOGO_DATA_URL, x: 8, y: 8, width: 24, height: 24 }]);
    });

    it("still produces the sheet when the logo cannot be loaded", async () => {
      mocks.loadLogo.mockRejectedValue(new Error("offline"));
      const doc = await render();
      expect(doc.images).toEqual([]);
      expect(doc.saved).toHaveLength(1);
      expect(textsOf(doc, "DECK REGISTRATION SHEET")).toHaveLength(1);
    });

    it("still produces the sheet when the PDF library rejects the logo", async () => {
      mocks.addImageFails.value = true;
      const doc = await render();
      expect(doc.images).toEqual([]);
      expect(doc.saved).toHaveLength(1);
      expect(textsOf(doc, "DECK REGISTRATION SHEET")).toHaveLength(1);
    });

    it("stamps the uppercased first letter of the last name in its box", async () => {
      const doc = await render({ fields: stubFields({ lastName: "lightshield" }) });
      const letter = onlyText(doc, "L");
      expect(letter.align).toBe("center");
      expect(letter.size).toBe(20);
    });

    it("leaves the letter box empty when no last name was given", async () => {
      const doc = await render({ fields: EMPTY_FIELDS });
      expect(doc.texts.filter((call) => call.size === 20)).toEqual([]);
      // The box itself is still drawn for the judge to fill in by hand.
      expect(doc.rects.some((rect) => rect.width === 10 && rect.height === 10)).toBe(true);
    });

    it("fills the event details table", async () => {
      const doc = await render();
      for (const label of ["Date:", "Event:", "Location:", "Deck Name:", "Deck Designer:"]) {
        expect(textsOf(doc, label)).toHaveLength(1);
      }
      for (const value of [
        "2026-08-15",
        "Summoner Skirmish",
        "Piltover Game Hall",
        "Piltover Tempo",
        "Ravi Chandra",
      ]) {
        expect(textsOf(doc, value)).toHaveLength(1);
      }
    });

    it("keeps the labels but writes no values when the fields are blank", async () => {
      const doc = await render({ fields: EMPTY_FIELDS });
      for (const label of ["Date:", "Event:", "Location:", "Deck Name:", "Deck Designer:"]) {
        expect(onlyText(doc, label).align).toBe("right");
      }
      // Every 8pt run in the info table is a label, so nothing was filled in.
      const infoRuns = doc.texts.filter((call) => call.size === 8);
      expect(infoRuns.map((call) => call.text)).toEqual([
        "Date:",
        "Event:",
        "Location:",
        "Deck Name:",
        "Deck Designer:",
      ]);
    });
  });

  describe("left margin", () => {
    it("writes the player details rotated up the margin", async () => {
      const doc = await render();
      const rotated = doc.texts.filter((call) => call.angle === 90);
      expect(rotated.map((call) => call.text)).toEqual([
        "Riot ID:",
        "Lightshield#EUW",
        "First Name:",
        "Ravi",
        "Last Name:",
        "Lightshield",
      ]);
      // Label and value share the margin's text column.
      expect(new Set(rotated.map((call) => call.x))).toEqual(new Set([15]));
    });

    it("offsets each value past its own label, and stacks the zones downward", async () => {
      const doc = await render();
      const rotated = doc.texts.filter((call) => call.angle === 90);
      const riotLabel = rotated[0];
      const riotValue = rotated[1];
      const firstLabel = rotated[2];
      const lastLabel = rotated[4];
      // Rotated text reads bottom-to-top, so "past the label" is a smaller y.
      expect(riotValue.y).toBeLessThan(riotLabel.y);
      expect(riotValue.style).toBe("bold");
      expect(riotLabel.style).toBe("italic");
      expect(firstLabel.y).toBeGreaterThan(riotLabel.y);
      expect(lastLabel.y).toBeGreaterThan(firstLabel.y);
    });

    it("keeps the labels but omits the values when the player fields are blank", async () => {
      const doc = await render({ fields: EMPTY_FIELDS });
      expect(doc.texts.filter((call) => call.angle === 90).map((call) => call.text)).toEqual([
        "Riot ID:",
        "First Name:",
        "Last Name:",
      ]);
    });
  });

  describe("sections", () => {
    it("labels every zone with the count it expects", async () => {
      const doc = await render();
      const labelled = ["Legend:", "Battlefields:", "Main Deck:", "Runes:", "Sideboard:"];
      for (const label of labelled) {
        expect(onlyText(doc, label).size).toBe(10);
      }
      expect(textsOf(doc, "Main Deck Continued:")).toHaveLength(1);
      for (const subtitle of ["(1 card)", "(3 cards)", "(40 cards)", "(12 cards)"]) {
        expect(textsOf(doc, subtitle)).toHaveLength(1);
      }
      expect(textsOf(doc, `(0-${SIDEBOARD_MAXIMUM} cards)`)).toHaveLength(1);
    });

    it("sorts each zone alphabetically", async () => {
      const doc = await render({
        cards: [
          zoneCard("Zaun Outskirts", WellKnown.deckZone.BATTLEFIELD),
          zoneCard("Anvil of the Forge", WellKnown.deckZone.BATTLEFIELD),
          zoneCard("Market Row", WellKnown.deckZone.BATTLEFIELD),
        ],
      });
      const left = onlyText(doc, "Legend:").x;
      const names = nameOnlyRowNames(
        doc,
        left,
        onlyText(doc, "Battlefields:").y,
        onlyText(doc, "Main Deck:").y,
      );
      expect(names).toEqual(["Anvil of the Forge", "Market Row", "Zaun Outskirts"]);
    });

    it("grows the legend block only when more than one legend is registered", async () => {
      const single = await render({
        cards: [zoneCard("Caitlyn, Sheriff", WellKnown.deckZone.LEGEND)],
      });
      const doubled = await render({
        cards: [
          zoneCard("Caitlyn, Sheriff", WellKnown.deckZone.LEGEND),
          zoneCard("Vi, Enforcer", WellKnown.deckZone.LEGEND),
        ],
      });
      // An empty legend zone still prints one blank line to write on.
      const empty = await render();
      expect(onlyText(empty, "Battlefields:").y).toBe(onlyText(single, "Battlefields:").y);
      expect(onlyText(doubled, "Battlefields:").y).toBeGreaterThan(
        onlyText(single, "Battlefields:").y,
      );
    });

    it("always prints exactly three battlefield lines, filled or not", async () => {
      const doc = await render({
        cards: [zoneCard("Market Row", WellKnown.deckZone.BATTLEFIELD)],
      });
      const left = onlyText(doc, "Legend:").x;
      const between = doc.lines.filter(
        (line) =>
          line.lineWidth === 0.15 &&
          line.x1 === left &&
          line.y1 > onlyText(doc, "Battlefields:").y &&
          line.y1 < onlyText(doc, "Main Deck:").y,
      );
      expect(between).toHaveLength(3);
    });
  });

  describe("main deck", () => {
    const CHAMPION_DECK = [
      zoneCard("Ashe, Frost Archer", WellKnown.deckZone.CHAMPION, 1),
      zoneCard("Ashe, Frost Archer", WellKnown.deckZone.MAIN, 2),
      zoneCard("Frostbite", WellKnown.deckZone.MAIN, 3),
      zoneCard("Avarosan Scout", WellKnown.deckZone.MAIN, 2),
    ];

    it("puts the champion first and folds its main-deck copies into one row", async () => {
      const doc = await render({ cards: CHAMPION_DECK });
      const left = onlyText(doc, "Legend:").x;
      const top = onlyText(doc, "Main Deck:").y;
      expect(rowNames(doc, left, top, BELOW_EVERYTHING)).toEqual([
        "Ashe, Frost Archer",
        "Avarosan Scout",
        "Frostbite",
      ]);
      // 1 champion copy + 2 main copies collapse into a single row of 3.
      expect(rowQuantities(doc, left, top, BELOW_EVERYTHING)).toEqual(["3", "2", "3"]);
    });

    it("annotates the champion row and drops the note when no champion is chosen", async () => {
      const withChampion = await render({ cards: CHAMPION_DECK });
      const note = onlyText(withChampion, "Chosen Champion");
      expect(note.align).toBe("right");
      expect(note.style).toBe("italic");

      const withoutChampion = await render({
        cards: [zoneCard("Frostbite", WellKnown.deckZone.MAIN, 3)],
      });
      expect(textsOf(withoutChampion, "Chosen Champion")).toEqual([]);
    });

    it("counts a champion with no main-deck copies at its own quantity", async () => {
      const doc = await render({
        cards: [zoneCard("Ashe, Frost Archer", WellKnown.deckZone.CHAMPION, 1)],
      });
      const left = onlyText(doc, "Legend:").x;
      const top = onlyText(doc, "Main Deck:").y;
      expect(rowQuantities(doc, left, top, BELOW_EVERYTHING)).toEqual(["1"]);
    });

    it("splits the fixed 40 rows across the two columns", async () => {
      const doc = await render();
      const left = onlyText(doc, "Legend:").x;
      const right = onlyText(doc, "Main Deck Continued:").x;
      const leftRows = rowCount(doc, left, onlyText(doc, "Main Deck:").y, BELOW_EVERYTHING);
      const rightRows = rowCount(
        doc,
        right,
        onlyText(doc, "Main Deck Continued:").y,
        onlyText(doc, "Runes:").y,
      );
      expect(leftRows).toBe(30);
      expect(rightRows).toBe(10);
      expect(leftRows + rightRows).toBe(40);
    });

    it("moves rows to the second column on the shorter Letter page", async () => {
      const doc = await render({ pageSize: "letter" });
      const left = onlyText(doc, "Legend:").x;
      const right = onlyText(doc, "Main Deck Continued:").x;
      const leftRows = rowCount(doc, left, onlyText(doc, "Main Deck:").y, BELOW_EVERYTHING);
      const rightRows = rowCount(
        doc,
        right,
        onlyText(doc, "Main Deck Continued:").y,
        onlyText(doc, "Runes:").y,
      );
      expect(leftRows).toBe(27);
      expect(rightRows).toBe(13);
      expect(leftRows + rightRows).toBe(40);
    });

    it("continues the main deck into the right column once the left one is full", async () => {
      const cards = Array.from({ length: 40 }, (_unused, index) =>
        zoneCard(`Card ${String(index + 1).padStart(2, "0")}`, WellKnown.deckZone.MAIN),
      );
      const doc = await render({ cards });
      const left = onlyText(doc, "Legend:").x;
      const right = onlyText(doc, "Main Deck Continued:").x;
      const leftNames = rowNames(doc, left, onlyText(doc, "Main Deck:").y, BELOW_EVERYTHING);
      const rightNames = rowNames(
        doc,
        right,
        onlyText(doc, "Main Deck Continued:").y,
        onlyText(doc, "Runes:").y,
      );
      expect(leftNames).toHaveLength(30);
      expect(leftNames[0]).toBe("Card 01");
      expect(rightNames).toEqual([
        "Card 31",
        "Card 32",
        "Card 33",
        "Card 34",
        "Card 35",
        "Card 36",
        "Card 37",
        "Card 38",
        "Card 39",
        "Card 40",
      ]);
    });

    it("silently drops main-deck cards past the fortieth row", async () => {
      // Pinning current behaviour: the sheet has 40 printed rows and an
      // over-full deck loses the tail rather than paginating.
      const cards = Array.from({ length: 45 }, (_unused, index) =>
        zoneCard(`Card ${String(index + 1).padStart(2, "0")}`, WellKnown.deckZone.MAIN),
      );
      const doc = await render({ cards });
      expect(textsOf(doc, "Card 40")).toHaveLength(1);
      for (const name of ["Card 41", "Card 42", "Card 43", "Card 44", "Card 45"]) {
        expect(textsOf(doc, name)).toEqual([]);
      }
    });
  });

  describe("runes and sideboard", () => {
    it("keeps two rune lines for an empty deck and grows with the entries", async () => {
      const empty = await render();
      const right = onlyText(empty, "Runes:").x;
      expect(
        rowCount(empty, right, onlyText(empty, "Runes:").y, onlyText(empty, "Sideboard:").y),
      ).toBe(2);

      const filled = await render({
        cards: [
          zoneCard("Fury Rune", WellKnown.deckZone.RUNES, 4),
          zoneCard("Body Rune", WellKnown.deckZone.RUNES, 4),
          zoneCard("Mind Rune", WellKnown.deckZone.RUNES, 4),
        ],
      });
      expect(
        rowCount(filled, right, onlyText(filled, "Runes:").y, onlyText(filled, "Sideboard:").y),
      ).toBe(3);
      expect(
        rowNames(filled, right, onlyText(filled, "Runes:").y, onlyText(filled, "Sideboard:").y),
      ).toEqual(["Body Rune", "Fury Rune", "Mind Rune"]);
    });

    it("always prints one sideboard line per allowed card", async () => {
      const doc = await render({
        cards: [zoneCard("Harsh Winds", WellKnown.deckZone.SIDEBOARD, 2)],
      });
      const right = onlyText(doc, "Sideboard:").x;
      expect(rowCount(doc, right, onlyText(doc, "Sideboard:").y, BELOW_EVERYTHING)).toBe(
        SIDEBOARD_MAXIMUM,
      );
      expect(rowNames(doc, right, onlyText(doc, "Sideboard:").y, BELOW_EVERYTHING)).toEqual([
        "Harsh Winds",
      ]);
    });

    it("ignores cards parked in the overflow zone", async () => {
      const doc = await render({
        cards: [zoneCard("Parked Card", WellKnown.deckZone.OVERFLOW, 1)],
      });
      expect(textsOf(doc, "Parked Card")).toEqual([]);
    });
  });

  describe("footer", () => {
    it("prints the official-use block with two deck-check columns", async () => {
      const doc = await render();
      // The typo matches the Piltover Archive sheet on purpose.
      expect(textsOf(doc, "FOR OFFICAL USE ONLY")).toHaveLength(1);
      expect(textsOf(doc, "Main/SB:")).toHaveLength(1);
      expect(onlyText(doc, "/").align).toBe("center");
      for (const label of ["Deck Check Rd #:", "Status:", "Judge:"]) {
        expect(textsOf(doc, label)).toHaveLength(2);
      }
      expect(doc.rects.some((rect) => rect.height === 22 && rect.lineWidth === 0.4)).toBe(true);
    });

    it("bottom-aligns the block inside the card area", async () => {
      const doc = await render();
      const box = doc.rects.find((rect) => rect.height === 22 && rect.lineWidth === 0.4);
      // Card area bottom is 12 mm above the A4 page edge, less the 3 mm padding.
      expect(box?.y).toBeCloseTo(297 - 12 - 22 - 3);
      expect(box?.x).toBeCloseTo(onlyText(doc, "Sideboard:").x);
    });
  });

  describe("filename", () => {
    it("slugifies the deck name", async () => {
      const doc = await render({ fields: stubFields({ deckName: "  Kai's Deck!! #2  " }) });
      expect(doc.saved).toEqual(["Kais-Deck-2-registration.pdf"]);
    });

    it("falls back when the deck name is empty or unusable", async () => {
      const blank = await render({ fields: stubFields({ deckName: "   " }) });
      expect(blank.saved).toEqual(["deck-registration.pdf"]);

      const punctuation = await render({ fields: stubFields({ deckName: "!!!" }) });
      expect(punctuation.saved).toEqual(["deck-registration.pdf"]);
    });
  });

  describe("empty input", () => {
    it("renders a blank but complete sheet", async () => {
      const doc = await render({ fields: EMPTY_FIELDS, cards: [] });
      expect(doc.saved).toEqual(["deck-registration.pdf"]);
      for (const label of [
        "Legend:",
        "Battlefields:",
        "Main Deck:",
        "Main Deck Continued:",
        "Runes:",
        "Sideboard:",
        "FOR OFFICAL USE ONLY",
      ]) {
        expect(textsOf(doc, label)).toHaveLength(1);
      }
      const left = onlyText(doc, "Legend:").x;
      expect(rowNames(doc, left, onlyText(doc, "Main Deck:").y, BELOW_EVERYTHING)).toEqual([]);
    });
  });
});
