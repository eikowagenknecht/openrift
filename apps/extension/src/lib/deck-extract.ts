import { isDeckCode } from "@openrift/shared/deck-code";
import type { TextEncodableCard } from "@openrift/shared/deck-codecs";
import { encodeText } from "@openrift/shared/deck-codecs";
import type { DeckZone } from "@openrift/shared/types";

/** What the content script found on the page, in order of preference. */
export type PageDeckExtract =
  /** A structured decklist, rebuilt as OpenRift's text interchange format. */
  | { kind: "text"; list: string; name?: string }
  /** A compact Piltover deck code found in the URL or page. */
  | { kind: "code"; code: string; name?: string }
  /** Nothing importable on this page. */
  | { kind: "none" };

/**
 * What the content script hands back: the decklist, plus the page's own
 * address when it is one OpenRift accepts as a deck link (`source-link.ts`).
 * The URL is read in the page, not from `tab.url`, so it needs no permission
 * beyond the injection itself.
 */
export interface PageExtract {
  deck: PageDeckExtract;
  sourceUrl?: string;
}

/**
 * Decklist group labels mapped to OpenRift deck zones. Labels not listed here
 * are card-type groupings of the main deck (unit, spell, gear, ...), which all
 * fold into the main zone.
 */
const GROUP_ZONES: Record<string, DeckZone> = {
  legend: "legend",
  legends: "legend",
  champion: "champion",
  champions: "champion",
  battlefield: "battlefield",
  battlefields: "battlefield",
  rune: "runes",
  runes: "runes",
  "rune pool": "runes",
  sideboard: "sideboard",
};

/**
 * Normalizes a group heading like "\u00A0 battlefields (3)" to its bare label.
 * @returns The lowercased label with the count suffix removed.
 */
function normalizeGroupLabel(text: string): string {
  return text
    .replaceAll("\u00A0", " ")
    .replaceAll(/\(\d+\)/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * Collapses whitespace in an element's text content.
 * @returns The cleaned text.
 */
function cleanText(text: string | null | undefined): string {
  return (text ?? "").replaceAll(/\s+/gu, " ").trim();
}

/**
 * Reads a structured decklist table: group headers are `.subheader` elements
 * and card rows are `tr.card-list-item` with the quantity in a `<b>` cell and
 * the card name as the text of a card link, zone groups interleaved with the
 * rows in one table.
 * @returns The cards found in the table, in document order.
 */
function readDecklistTable(table: HTMLTableElement): TextEncodableCard[] {
  const cards: TextEncodableCard[] = [];
  let currentZone: DeckZone = "main";

  for (const row of table.querySelectorAll("tr")) {
    const groupHeader = row.querySelector(".subheader");
    if (groupHeader) {
      const label = normalizeGroupLabel(groupHeader.textContent ?? "");
      // Unknown labels are card-type groupings of the main deck.
      currentZone = GROUP_ZONES[label] ?? "main";
      continue;
    }

    if (!row.classList.contains("card-list-item")) {
      continue;
    }
    const cardName = cleanText(row.querySelector('a[href*="/cards/"]')?.textContent);
    if (cardName === "") {
      continue;
    }
    const quantityText = cleanText(row.querySelector("b")?.textContent);
    const quantity = /^\d+$/u.test(quantityText) ? Number(quantityText) : 1;
    cards.push({ cardName, quantity, zone: currentZone });
  }

  return cards;
}

/**
 * Finds the decklist on a page laid out as a grouped table and rebuilds it as
 * OpenRift's text format. When several tables qualify, the one with the most
 * card rows wins (a page never has more than one real decklist table).
 * @returns The text-format decklist, or null when the page has none.
 */
export function extractTableDecklist(doc: Document): string | null {
  let best: TextEncodableCard[] = [];
  for (const table of doc.querySelectorAll("table")) {
    if (!table.querySelector(".subheader")) {
      continue;
    }
    const cards = readDecklistTable(table);
    if (cards.length > best.length) {
      best = cards;
    }
  }
  if (best.length === 0) {
    return null;
  }
  return encodeText(best).code;
}

/**
 * Reads a decklist laid out as sectioned card-name rows: sections are
 * `.section-header` elements (label text like "Sideboard (10)") and each card
 * row is a `.card-name-text` element whose first span is the quantity and
 * second span the card name.
 *
 * Only a sideboard section maps to a zone. Other section labels group cards
 * in ways that don't line up with OpenRift zones, so those rows are emitted
 * as plain unheadered lines — the import page infers
 * legend/champion/runes/battlefield zones from card types, which is more
 * reliable than mapping labels.
 * @returns The text-format decklist, or null when the page has none.
 */
export function extractSectionedListDecklist(doc: Document): string | null {
  if (!doc.querySelector(".section-header")) {
    return null;
  }
  const mainLines: string[] = [];
  const sideboardLines: string[] = [];
  let inSideboard = false;

  for (const element of doc.querySelectorAll(".section-header, .card-name-text")) {
    if (element.classList.contains("section-header")) {
      inSideboard = normalizeGroupLabel(element.textContent ?? "") === "sideboard";
      continue;
    }
    const spans = element.querySelectorAll("span");
    if (spans.length < 2) {
      continue;
    }
    const quantityText = cleanText(spans[0].textContent);
    const cardName = cleanText(spans[1].textContent);
    if (!/^\d+$/u.test(quantityText) || cardName === "") {
      continue;
    }
    (inSideboard ? sideboardLines : mainLines).push(`${quantityText} ${cardName}`);
  }

  if (mainLines.length === 0 && sideboardLines.length === 0) {
    return null;
  }
  if (sideboardLines.length === 0) {
    return mainLines.join("\n");
  }
  return [...mainLines, "", "Sideboard:", ...sideboardLines].join("\n");
}

/**
 * Splits a URL into candidate tokens: path segments, query values, and hash
 * pieces. Mirrors the sniffing the OpenRift import page applies to pasted
 * links.
 * @returns The candidate tokens in order of appearance.
 */
function urlTokens(href: string): string[] {
  let url: URL;
  try {
    // The base only serves to make relative hrefs parseable; tokens come from
    // the path/query/hash, never the host.
    url = new URL(href, "https://relative.invalid");
  } catch {
    return [];
  }
  const tokens = url.pathname.split("/").filter(Boolean);
  for (const [, value] of url.searchParams) {
    if (value) {
      tokens.push(value);
    }
  }
  for (const piece of url.hash.replace(/^#/u, "").split(/[/=&?]/u)) {
    if (piece) {
      tokens.push(piece);
    }
  }
  return tokens;
}

/**
 * Elements whose text plausibly carries a shareable deck code. Every
 * candidate is decode-verified, so over-matching here costs nothing.
 */
const CODE_CARRIER_SELECTOR = 'code, kbd, pre, input, textarea, [class*="code" i]';

/**
 * Hunts for a Piltover deck code in the page URL, in code-ish elements
 * (code/pre blocks, inputs, class names containing "code"), and in link
 * targets. Every candidate is verified with a real decode, so
 * plausible-looking words never match.
 * @returns The first valid deck code, or null.
 */
export function findDeckCode(doc: Document, href: string): string | null {
  const candidates = urlTokens(href);
  for (const element of doc.querySelectorAll(CODE_CARRIER_SELECTOR)) {
    // tagName instead of instanceof: nodes from another realm (iframes) fail
    // instanceof checks against this realm's constructors.
    const text =
      element.tagName === "INPUT" || element.tagName === "TEXTAREA"
        ? (element as HTMLInputElement | HTMLTextAreaElement).value
        : element.textContent;
    for (const token of (text ?? "").split(/\s+/u)) {
      if (token) {
        candidates.push(token);
      }
    }
  }
  for (const anchor of doc.querySelectorAll("a[href]")) {
    candidates.push(...urlTokens(anchor.getAttribute("href") ?? ""));
  }
  for (const candidate of candidates) {
    if (isDeckCode(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Reads the page's main heading as the deck name. On deck pages the h1 is the
 * deck's title; the import page's name field stays editable either way.
 * @returns The cleaned heading text, or undefined when the page has none.
 */
function extractDeckName(doc: Document): string | undefined {
  const name = cleanText(doc.querySelector("h1")?.textContent);
  return name === "" ? undefined : name;
}

/**
 * Extracts whatever deck the page offers: a structured decklist first, then a
 * compact deck code as fallback.
 * @returns The extraction result.
 */
export function extractDeckFromPage(doc: Document, href: string): PageDeckExtract {
  const list = extractTableDecklist(doc) ?? extractSectionedListDecklist(doc);
  if (list !== null) {
    return { kind: "text", list, name: extractDeckName(doc) };
  }
  const code = findDeckCode(doc, href);
  if (code !== null) {
    return { kind: "code", code, name: extractDeckName(doc) };
  }
  return { kind: "none" };
}
