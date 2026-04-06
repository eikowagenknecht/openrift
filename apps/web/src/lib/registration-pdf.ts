import type { DeckZone } from "@openrift/shared";
import { jsPDF } from "jspdf";

import type { DeckBuilderCard } from "@/stores/deck-builder-store";

export type RegistrationPageSize = "a4" | "letter";

export interface RegistrationFields {
  deckName: string;
  deckDesigner: string;
  firstName: string;
  lastName: string;
  riotId: string;
  eventDate: string;
  eventName: string;
  eventLocation: string;
}

const PAGE_SIZES = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
} as const;

// ── Layout constants (mm) ──────────────────────────────────────────────────

const MARGIN_TOP = 8;
const LEFT_MARGIN_WIDTH = 22;
const RIGHT_MARGIN = 10;
const ROW_HEIGHT = 5.5;
const BODY_FONT_SIZE = 9;
const SMALL_FONT_SIZE = 7;
const SECTION_HEADER_FONT_SIZE = 10;
const TITLE_FONT_SIZE = 16;
const COL_GAP = 4;
const LOGO_SIZE = 24;
const FIRST_LETTER_BOX_SIZE = 10;

// ── Helpers ────────────────────────────────────────────────────────────────

interface RegistrationCard {
  name: string;
  quantity: number;
}

function cardsForZone(cards: DeckBuilderCard[], zone: DeckZone): RegistrationCard[] {
  return cards
    .filter((card) => card.zone === zone)
    .toSorted((first, second) => first.cardName.localeCompare(second.cardName))
    .map((card) => ({ name: card.cardName, quantity: card.quantity }));
}

// ── Left margin (rotated player info) ─────────────────────────────────────

function drawLeftMargin(
  doc: jsPDF,
  fields: RegistrationFields,
  cardAreaTop: number,
  cardAreaBottom: number,
): void {
  const marginX = LEFT_MARGIN_WIDTH;

  // Split the area into 3 equal zones for Last Name, First Name, Riot ID
  const totalHeight = cardAreaBottom - cardAreaTop;
  const zoneHeight = totalHeight / 3;

  const riotZoneTop = cardAreaTop;
  const firstZoneTop = cardAreaTop + zoneHeight;
  const lastZoneTop = cardAreaTop + 2 * zoneHeight;

  // Draw thin separator lines between zones
  const marginLeft = 15; // 1.5cm from page edge
  const centerX = marginLeft;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, firstZoneTop, marginX, firstZoneTop);
  doc.line(marginLeft, lastZoneTop, marginX, lastZoneTop);
  doc.setLineWidth(0.2);

  // Parse Riot ID into name and tag parts
  const riotParts = fields.riotId.split("#");
  const riotName = riotParts[0]?.trim() ?? "";
  const riotTag = riotParts.length > 1 ? (riotParts[1]?.trim() ?? "") : "";

  // Riot ID zone (top third)
  if (riotTag) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(riotTag, centerX, riotZoneTop + 8, { align: "center", angle: 90 });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text("#", centerX, riotZoneTop + zoneHeight * 0.4, { align: "center", angle: 90 });

  if (riotName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(riotName, centerX, riotZoneTop + zoneHeight * 0.65, {
      align: "center",
      angle: 90,
    });
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(SMALL_FONT_SIZE);
  doc.setTextColor(100, 100, 100);
  doc.text("Riot ID:", centerX, riotZoneTop + zoneHeight - 3, { align: "center", angle: 90 });

  // First Name zone (middle third)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  if (fields.firstName) {
    doc.text(fields.firstName, centerX, firstZoneTop + zoneHeight / 2, {
      align: "center",
      angle: 90,
    });
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(SMALL_FONT_SIZE);
  doc.setTextColor(100, 100, 100);
  doc.text("First Name:", centerX, firstZoneTop + zoneHeight - 3, {
    align: "center",
    angle: 90,
  });

  // Last Name zone (bottom third)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  if (fields.lastName) {
    doc.text(fields.lastName, centerX, lastZoneTop + zoneHeight / 2, {
      align: "center",
      angle: 90,
    });
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(SMALL_FONT_SIZE);
  doc.setTextColor(100, 100, 100);
  doc.text("Last Name:", centerX, lastZoneTop + zoneHeight - 3, {
    align: "center",
    angle: 90,
  });

  doc.setTextColor(0, 0, 0);
}

// ── Header (logo, title, info fields) ─────────────────────────────────────

function drawHeader(
  doc: jsPDF,
  fields: RegistrationFields,
  logoDataUrl: string | null,
  pageWidth: number,
): number {
  let currentY = MARGIN_TOP;

  const contentLeft = LEFT_MARGIN_WIDTH;
  const contentRight = pageWidth - RIGHT_MARGIN;

  // Logo (top-left of content area)
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", contentLeft, currentY, LOGO_SIZE, LOGO_SIZE);
    } catch {
      // Skip logo if loading fails
    }
  }

  // "openrift.app" centered below logo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(100, 100, 100);
  doc.text("openrift.app", contentLeft + LOGO_SIZE / 2, currentY + LOGO_SIZE + 3, {
    align: "center",
  });
  doc.setTextColor(0, 0, 0);

  // Title "DECK REGISTRATION SHEET"
  doc.setFont("helvetica", "bold");
  doc.setFontSize(TITLE_FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  const titleX = contentLeft + LOGO_SIZE + 4;
  doc.text("DECK REGISTRATION SHEET", titleX, currentY + 8);

  // "First Letter of Last Name" box (top-right)
  const boxX = contentRight - FIRST_LETTER_BOX_SIZE;
  const boxY = currentY;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(0, 0, 0);
  doc.text("First Letter of", boxX - 1, boxY + 3, { align: "right" });
  doc.text("Last Name", boxX - 1, boxY + 6, { align: "right" });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.rect(boxX, boxY, FIRST_LETTER_BOX_SIZE, FIRST_LETTER_BOX_SIZE);
  doc.setLineWidth(0.2);

  // First letter
  if (fields.lastName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(
      fields.lastName.charAt(0).toUpperCase(),
      boxX + FIRST_LETTER_BOX_SIZE / 2,
      boxY + FIRST_LETTER_BOX_SIZE / 2 + 2,
      { align: "center" },
    );
  }

  // ── Info fields table (below title) ─────────────────────────────────────

  const infoY = currentY + 14;
  const infoLeft = contentLeft + LOGO_SIZE + 4;
  const infoRight = contentRight - FIRST_LETTER_BOX_SIZE - 4;
  const infoWidth = infoRight - infoLeft;
  const halfInfoWidth = infoWidth / 2;
  const infoRowHeight = 8;
  const labelColWidth = 22;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);

  // Row 1: Date | Event
  doc.rect(infoLeft, infoY, halfInfoWidth, infoRowHeight);
  doc.rect(infoLeft + halfInfoWidth, infoY, halfInfoWidth, infoRowHeight);

  // Row 2: Location | Deck Name
  doc.rect(infoLeft, infoY + infoRowHeight, halfInfoWidth, infoRowHeight);
  doc.rect(infoLeft + halfInfoWidth, infoY + infoRowHeight, halfInfoWidth, infoRowHeight);

  // Row 3: Deck Designer (full width)
  doc.rect(infoLeft, infoY + 2 * infoRowHeight, infoWidth, infoRowHeight);

  doc.setLineWidth(0.2);

  const textY1 = infoY + 5.5;
  const textY2 = infoY + infoRowHeight + 5.5;
  const textY3 = infoY + 2 * infoRowHeight + 5.5;

  doc.setFontSize(8);

  // Date — label right-aligned, value left-aligned after label column
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Date:", infoLeft + labelColWidth - 1, textY1, { align: "right" });
  doc.setTextColor(0, 0, 0);
  if (fields.eventDate) {
    doc.text(fields.eventDate, infoLeft + labelColWidth + 2, textY1);
  }

  // Event
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Event:", infoLeft + halfInfoWidth + labelColWidth - 1, textY1, { align: "right" });
  doc.setTextColor(0, 0, 0);
  if (fields.eventName) {
    doc.text(fields.eventName, infoLeft + halfInfoWidth + labelColWidth + 2, textY1);
  }

  // Location
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Location:", infoLeft + labelColWidth - 1, textY2, { align: "right" });
  doc.setTextColor(0, 0, 0);
  if (fields.eventLocation) {
    doc.text(fields.eventLocation, infoLeft + labelColWidth + 2, textY2);
  }

  // Deck Name
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Deck Name:", infoLeft + halfInfoWidth + labelColWidth - 1, textY2, { align: "right" });
  doc.setTextColor(0, 0, 0);
  if (fields.deckName) {
    doc.text(fields.deckName, infoLeft + halfInfoWidth + labelColWidth + 2, textY2);
  }

  // Deck Designer (full-width third row)
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Deck Designer:", infoLeft + labelColWidth + 8, textY3, { align: "right" });
  doc.setTextColor(0, 0, 0);
  if (fields.deckDesigner) {
    doc.text(fields.deckDesigner, infoLeft + labelColWidth + 11, textY3);
  }

  currentY = infoY + 3 * infoRowHeight + 2;

  // ── "PRINT CLEARLY..." banner ──────────────────────────────────────────

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("PRINT CLEARLY USING ENGLISH CARD NAMES", contentLeft, currentY + 5);

  currentY += 8;

  return currentY;
}

// ── Section drawing helpers ───────────────────────────────────────────────

function drawSectionLabel(doc: jsPDF, label: string, startX: number, startY: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SECTION_HEADER_FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  doc.text(`${label}:`, startX, startY + 4);
  return startY + 6;
}

function drawNameOnlyHeader(doc: jsPDF, startX: number, startY: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(BODY_FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  doc.text("Card Name:", startX, startY + 3.5);
  return startY + 5;
}

function drawQtyNameHeader(doc: jsPDF, startX: number, startY: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(BODY_FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  doc.text("# in deck:", startX, startY + 3.5);
  doc.text("Card Name:", startX + 18, startY + 3.5);
  return startY + 5;
}

function drawNameOnlyRows(
  doc: jsPDF,
  cards: RegistrationCard[],
  totalRows: number,
  startX: number,
  startY: number,
  width: number,
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY_FONT_SIZE);
  let currentY = startY;

  for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
    const card = cards[rowIndex];

    if (card) {
      doc.setTextColor(0, 0, 0);
      doc.text(card.name, startX, currentY + 3.5);
    }

    // Row underline
    currentY += ROW_HEIGHT;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.line(startX, currentY, startX + width, currentY);
  }

  return currentY;
}

function drawQtyNameRows(
  doc: jsPDF,
  cards: RegistrationCard[],
  totalRows: number,
  startX: number,
  startY: number,
  width: number,
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY_FONT_SIZE);
  let currentY = startY;

  for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
    const card = cards[rowIndex];

    if (card) {
      doc.setTextColor(0, 0, 0);
      doc.text(String(card.quantity), startX + 6, currentY + 3.5, { align: "center" });
      doc.text(card.name, startX + 18, currentY + 3.5);
    }

    // Row underlines (separate for qty and name)
    currentY += ROW_HEIGHT;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.line(startX, currentY, startX + 12, currentY);
    doc.line(startX + 18, currentY, startX + width, currentY);
  }

  return currentY;
}

// ── Footer (FOR OFFICIAL USE ONLY) ────────────────────────────────────────

function drawFooter(doc: jsPDF, startX: number, startY: number, width: number): number {
  const boxWidth = width;
  const boxHeight = 22;
  const halfWidth = boxWidth / 2;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(startX, startY, boxWidth, boxHeight);
  doc.setLineWidth(0.2);

  // "FOR OFFICIAL USE ONLY" header — matching Piltover's typo intentionally
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(0, 0, 0);
  doc.text("FOR OFFICAL USE ONLY", startX + 2, startY + 3.5);

  // Main/SB on right side of header
  doc.text("Main/SB:", startX + halfWidth + 2, startY + 3.5);
  doc.setFont("helvetica", "normal");
  doc.text("/", startX + boxWidth - 8, startY + 3.5);

  // Separator line after header
  doc.line(startX, startY + 5, startX + boxWidth, startY + 5);

  // Vertical divider
  doc.line(startX + halfWidth, startY + 5, startX + halfWidth, startY + boxHeight);

  // Left column: Deck Check 1
  const leftX = startX + 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(SMALL_FONT_SIZE);

  doc.text("Deck Check Rd #:", leftX, startY + 9);
  doc.text("Status:", leftX, startY + 14);
  doc.text("Judge:", leftX, startY + 19);

  // Right column: Deck Check 2
  const rightX = startX + halfWidth + 2;
  doc.text("Deck Check Rd #:", rightX, startY + 9);
  doc.text("Status:", rightX, startY + 14);
  doc.text("Judge:", rightX, startY + 19);

  return startY + boxHeight;
}

// ── Logo loader ───────────────────────────────────────────────────────────

let cachedLogoDataUrl: string | null = null;

/**
 * Loads the OpenRift logo as a PNG data URL for embedding in PDFs.
 * @returns A data URL string for the logo image.
 */
async function loadLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) {
    return cachedLogoDataUrl;
  }

  // oxlint-disable-next-line promise/avoid-new -- wrapping callback-based Image loading API
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = "/logo.webp";
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas 2d context");
  }
  ctx.drawImage(img, 0, 0);
  cachedLogoDataUrl = canvas.toDataURL("image/png");
  return cachedLogoDataUrl;
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Generates a tournament deck registration sheet PDF matching the Piltover Archive format.
 * @returns void — triggers browser download.
 */
export async function generateRegistrationPdf(
  fields: RegistrationFields,
  cards: DeckBuilderCard[],
  pageSize: RegistrationPageSize,
): Promise<void> {
  const page = PAGE_SIZES[pageSize];
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: pageSize === "a4" ? "a4" : "letter",
  });

  const contentLeft = LEFT_MARGIN_WIDTH;
  const contentRight = page.width - RIGHT_MARGIN;
  const contentWidth = contentRight - contentLeft;

  // ── Logo ────────────────────────────────────────────────────────────────

  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await loadLogoDataUrl();
  } catch {
    // Skip logo if loading fails
  }

  // ── Header ──────────────────────────────────────────────────────────────

  const cardAreaTop = drawHeader(doc, fields, logoDataUrl, page.width);

  // ── Card area border ────────────────────────────────────────────────────

  const cardAreaBottom = page.height - 12;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.rect(contentLeft, cardAreaTop, contentWidth, cardAreaBottom - cardAreaTop);
  doc.setLineWidth(0.2);

  // ── Left margin (rotated player info) ───────────────────────────────────

  drawLeftMargin(doc, fields, cardAreaTop, cardAreaBottom);

  // ── Card sections ───────────────────────────────────────────────────────

  const padding = 3;
  const innerLeft = contentLeft + padding;
  const colWidth = (contentWidth - COL_GAP - 2 * padding) / 2;
  const rightColX = contentLeft + contentWidth / 2 + COL_GAP / 2;

  let leftY = cardAreaTop + padding;
  let rightY = cardAreaTop + padding;

  // Prepare card data
  const legendCards = cardsForZone(cards, "legend");
  const battlefieldCards = cardsForZone(cards, "battlefield");
  const championCards = cardsForZone(cards, "champion");
  const mainCards = cardsForZone(cards, "main");
  const runeCards = cardsForZone(cards, "runes");
  const sideboardCards = cardsForZone(cards, "sideboard");

  // ── LEFT COLUMN ─────────────────────────────────────────────────────────

  // Legend
  leftY = drawSectionLabel(doc, "Legend", innerLeft, leftY);
  leftY = drawNameOnlyHeader(doc, innerLeft, leftY);
  leftY = drawNameOnlyRows(
    doc,
    legendCards,
    Math.max(legendCards.length, 1),
    innerLeft,
    leftY,
    colWidth,
  );
  leftY += 3;

  // Battlefields
  leftY = drawSectionLabel(doc, "Battlefields", innerLeft, leftY);
  leftY = drawNameOnlyHeader(doc, innerLeft, leftY);
  leftY = drawNameOnlyRows(doc, battlefieldCards, 3, innerLeft, leftY, colWidth);
  leftY += 3;

  // Main Deck
  leftY = drawSectionLabel(doc, "Main Deck", innerLeft, leftY);
  leftY = drawQtyNameHeader(doc, innerLeft, leftY);

  // Merge champion into main deck as a single combined entry
  const allMainCards = [...mainCards];
  for (const champ of championCards) {
    const existing = allMainCards.find((card) => card.name === champ.name);
    if (existing) {
      existing.quantity += champ.quantity;
    } else {
      allMainCards.unshift(champ);
    }
  }
  allMainCards.sort((first, second) => first.name.localeCompare(second.name));

  // Draw "Chosen Champion" label on the first row (single line, beside the header)
  if (championCards.length > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("Chosen Champion", innerLeft + colWidth - 28, leftY + 3.5);
    doc.setTextColor(0, 0, 0);
  }

  // Fixed 40 main deck rows split across both columns.
  // Left column gets as many as fit; right column gets the remainder.
  const TOTAL_MAIN_ROWS = 40;
  const remainingLeftSpace = cardAreaBottom - leftY - padding;
  const leftMainTotalRows = Math.floor(remainingLeftSpace / ROW_HEIGHT);
  const rightMainTotalRows = TOTAL_MAIN_ROWS - leftMainTotalRows;

  const leftMainCards = allMainCards.slice(0, leftMainTotalRows);
  leftY = drawQtyNameRows(doc, leftMainCards, leftMainTotalRows, innerLeft, leftY, colWidth);

  // ── RIGHT COLUMN ────────────────────────────────────────────────────────

  // Main Deck Continued
  const rightMainCards = allMainCards.slice(leftMainTotalRows);
  rightY = drawSectionLabel(doc, "Main Deck Continued", rightColX, rightY);
  rightY = drawQtyNameHeader(doc, rightColX, rightY);

  rightY = drawQtyNameRows(doc, rightMainCards, rightMainTotalRows, rightColX, rightY, colWidth);
  rightY += 3;

  // Runes
  const runeRowCount = Math.max(runeCards.length, 2);
  rightY = drawSectionLabel(doc, "Runes", rightColX, rightY);
  rightY = drawQtyNameHeader(doc, rightColX, rightY);
  rightY = drawQtyNameRows(doc, runeCards, runeRowCount, rightColX, rightY, colWidth);
  rightY += 3;

  // Sideboard (exactly 8 rows)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SECTION_HEADER_FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  doc.text("Sideboard:", rightColX, rightY + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  doc.text("(0-8 cards)", rightColX + doc.getTextWidth("Sideboard:  ") + 6, rightY + 4);
  doc.setTextColor(0, 0, 0);
  rightY += 6;

  rightY = drawQtyNameHeader(doc, rightColX, rightY);
  rightY = drawQtyNameRows(doc, sideboardCards, 8, rightColX, rightY, colWidth);
  rightY += 5;

  // ── Footer ──────────────────────────────────────────────────────────────

  drawFooter(doc, rightColX, rightY, colWidth);

  // ── Download ────────────────────────────────────────────────────────────

  const safeName = fields.deckName
    .replaceAll(/[^\w\s-]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-");
  doc.save(`${safeName || "deck"}-registration.pdf`);
}
