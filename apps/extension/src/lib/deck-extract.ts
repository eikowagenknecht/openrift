import { isDeckCode } from "@openrift/shared/deck-code";
import type { TextEncodableCard } from "@openrift/shared/deck-codecs/text";
import { encodeText } from "@openrift/shared/deck-codecs/text";
import type { DeckZone } from "@openrift/shared/types/enums";

/** What the content script found on the page, in order of preference. */
export type PageDeckExtract =
  | { kind: "text"; list: string; name?: string }
  | { kind: "code"; code: string; name?: string }
  | { kind: "none" };

// The URL is read in the page, not from tab.url, so it needs no permission
// beyond the injection itself.
export interface PageExtract {
  deck: PageDeckExtract;
  sourceUrl?: string;
}

// Labels not listed here are card-type groupings of the main deck (unit,
// spell, gear, ...), which all fold into the main zone.
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

function normalizeGroupLabel(text: string): string {
  return text
    .replaceAll("\u00A0", " ")
    .replaceAll(/\(\d+\)/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function cleanText(text: string | null | undefined): string {
  return (text ?? "").replaceAll(/\s+/gu, " ").trim();
}

// Group headers are `.subheader` elements; card rows are `tr.card-list-item`
// with the quantity in a `<b>` cell and the name as the card link's text.
function readDecklistTable(table: HTMLTableElement): TextEncodableCard[] {
  const cards: TextEncodableCard[] = [];
  let currentZone: DeckZone = "main";

  for (const row of table.querySelectorAll("tr")) {
    const groupHeader = row.querySelector(".subheader");
    if (groupHeader) {
      const label = normalizeGroupLabel(groupHeader.textContent ?? "");
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

// When several tables qualify, the one with the most card rows wins.
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

// Rows are `.card-name-text` elements (quantity span, then name span). Only
// a sideboard `.section-header` maps to a zone; other labels stay unheadered.
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
    const [quantitySpan, nameSpan] = element.querySelectorAll("span");
    if (quantitySpan === undefined || nameSpan === undefined) {
      continue;
    }
    const quantityText = cleanText(quantitySpan.textContent);
    const cardName = cleanText(nameSpan.textContent);
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

function urlTokens(href: string): string[] {
  let url: URL;
  try {
    // The base only makes relative hrefs parseable; tokens never use the host.
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

// Every candidate is decode-verified, so over-matching here costs nothing.
const CODE_CARRIER_SELECTOR = 'code, kbd, pre, input, textarea, [class*="code" i]';

export function findDeckCode(doc: Document, href: string): string | null {
  const candidates = urlTokens(href);
  for (const element of doc.querySelectorAll(CODE_CARRIER_SELECTOR)) {
    // Nodes from another realm (iframes) fail instanceof checks against
    // this realm's constructors, so tagName is checked here.
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

function extractDeckName(doc: Document): string | undefined {
  const name = cleanText(doc.querySelector("h1")?.textContent);
  return name === "" ? undefined : name;
}

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
