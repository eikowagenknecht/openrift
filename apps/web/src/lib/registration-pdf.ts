import type { DeckZone } from "@openrift/shared";
import { jsPDF } from "jspdf";

import type { DeckBuilderCard } from "@/stores/deck-builder-store";

export type RegistrationPageSize = "a4" | "letter";

export interface RegistrationFields {
  deckName: string;
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
const LEFT_MARGIN_WIDTH = 18;
const RIGHT_MARGIN = 10;
const ROW_HEIGHT = 5;
const BODY_FONT_SIZE = 7.5;
const SMALL_FONT_SIZE = 6;
const SECTION_HEADER_FONT_SIZE = 9;
const TITLE_FONT_SIZE = 16;
const COL_GAP = 4;
const LOGO_SIZE = 24;
const FIRST_LETTER_BOX_SIZE = 14;

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
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(2, firstZoneTop, marginX, firstZoneTop);
  doc.line(2, lastZoneTop, marginX, lastZoneTop);
  doc.setLineWidth(0.2);

  // Parse Riot ID into name and tag parts
  const riotParts = fields.riotId.split("#");
  const riotName = riotParts[0]?.trim() ?? "";
  const riotTag = riotParts.length > 1 ? (riotParts[1]?.trim() ?? "") : "";

  // Riot ID zone (top third)
  if (riotTag) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(riotTag, marginX / 2, riotZoneTop + 8, { align: "center", angle: 90 });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text("#", marginX / 2, riotZoneTop + zoneHeight * 0.4, { align: "center", angle: 90 });

  if (riotName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(riotName, marginX / 2, riotZoneTop + zoneHeight * 0.65, {
      align: "center",
      angle: 90,
    });
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(SMALL_FONT_SIZE);
  doc.setTextColor(100, 100, 100);
  doc.text("Riot ID:", marginX / 2, riotZoneTop + zoneHeight - 3, { align: "center", angle: 90 });

  // First Name zone (middle third)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  if (fields.firstName) {
    doc.text(fields.firstName, marginX / 2, firstZoneTop + zoneHeight / 2, {
      align: "center",
      angle: 90,
    });
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(SMALL_FONT_SIZE);
  doc.setTextColor(100, 100, 100);
  doc.text("First Name:", marginX / 2, firstZoneTop + zoneHeight - 3, {
    align: "center",
    angle: 90,
  });

  // Last Name zone (bottom third)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  if (fields.lastName) {
    doc.text(fields.lastName, marginX / 2, lastZoneTop + zoneHeight / 2, {
      align: "center",
      angle: 90,
    });
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(SMALL_FONT_SIZE);
  doc.setTextColor(100, 100, 100);
  doc.text("Last Name:", marginX / 2, lastZoneTop + zoneHeight - 3, {
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
  const contentWidth = contentRight - contentLeft;

  // Logo (top-left of content area)
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", contentLeft, currentY, LOGO_SIZE, LOGO_SIZE);
    } catch {
      // Skip logo if loading fails
    }
  }

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
  doc.setFontSize(5.5);
  doc.setTextColor(0, 0, 0);
  doc.text("First Letter of", contentRight - FIRST_LETTER_BOX_SIZE - 2, boxY + 4, {
    align: "right",
  });
  doc.text("Last Name", contentRight - FIRST_LETTER_BOX_SIZE - 2, boxY + 7.5, { align: "right" });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.rect(boxX, boxY, FIRST_LETTER_BOX_SIZE, FIRST_LETTER_BOX_SIZE);
  doc.setLineWidth(0.2);

  // First letter
  if (fields.lastName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(
      fields.lastName.charAt(0).toUpperCase(),
      boxX + FIRST_LETTER_BOX_SIZE / 2,
      boxY + FIRST_LETTER_BOX_SIZE / 2 + 3,
      { align: "center" },
    );
  }

  // ── Info fields table (below logo) ──────────────────────────────────────

  const infoY = currentY + 14;
  const infoLeft = contentLeft + LOGO_SIZE + 4;
  const infoWidth = contentRight - FIRST_LETTER_BOX_SIZE - 6 - infoLeft;
  const halfInfoWidth = infoWidth / 2;
  const infoRowHeight = 8;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);

  // Row 1: Date | Event
  doc.rect(infoLeft, infoY, halfInfoWidth, infoRowHeight);
  doc.rect(infoLeft + halfInfoWidth, infoY, halfInfoWidth, infoRowHeight);

  // Row 2: Location | Deck Name
  doc.rect(infoLeft, infoY + infoRowHeight, halfInfoWidth, infoRowHeight);
  doc.rect(infoLeft + halfInfoWidth, infoY + infoRowHeight, halfInfoWidth, infoRowHeight);

  doc.setLineWidth(0.2);

  // Field labels and values
  const labelOffset = 3;
  const valueOffset = 18;
  const textY1 = infoY + 5.5;
  const textY2 = infoY + infoRowHeight + 5.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY_FONT_SIZE);

  // Date
  doc.setTextColor(100, 100, 100);
  doc.text("Date:", infoLeft + labelOffset, textY1);
  doc.setTextColor(0, 0, 0);
  if (fields.eventDate) {
    doc.text(fields.eventDate, infoLeft + valueOffset, textY1);
  }

  // Event
  doc.setTextColor(100, 100, 100);
  doc.text("Event:", infoLeft + halfInfoWidth + labelOffset, textY1);
  doc.setTextColor(0, 0, 0);
  if (fields.eventName) {
    doc.text(fields.eventName, infoLeft + halfInfoWidth + valueOffset, textY1);
  }

  // Location
  doc.setTextColor(100, 100, 100);
  doc.text("Location:", infoLeft + labelOffset, textY2);
  doc.setTextColor(0, 0, 0);
  if (fields.eventLocation) {
    doc.text(fields.eventLocation, infoLeft + valueOffset + 4, textY2);
  }

  // Deck Name
  doc.setTextColor(100, 100, 100);
  doc.text("Deck Name:", infoLeft + halfInfoWidth + labelOffset, textY2);
  doc.setTextColor(0, 0, 0);
  if (fields.deckName) {
    doc.text(fields.deckName, infoLeft + halfInfoWidth + valueOffset + 6, textY2);
  }

  currentY = infoY + 2 * infoRowHeight + 2;

  // ── "PRINT CLEARLY..." banner and Deck Designer ────────────────────────

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("PRINT CLEARLY USING ENGLISH CARD NAMES", contentLeft, currentY + 5);

  // Deck Designer field (right side of banner)
  const designerBoxX = contentLeft + contentWidth * 0.6;
  const designerBoxWidth = contentWidth * 0.4;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(designerBoxX, currentY + 0.5, designerBoxWidth, 7);
  doc.setLineWidth(0.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY_FONT_SIZE);
  doc.setTextColor(100, 100, 100);
  doc.text("Deck Designer:", designerBoxX + 2, currentY + 5);
  doc.setTextColor(0, 0, 0);

  currentY += 10;

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
    Math.max(legendCards.length, 1) + 2,
    innerLeft,
    leftY,
    colWidth,
  );
  leftY += 3;

  // Battlefields
  leftY = drawSectionLabel(doc, "Battlefields", innerLeft, leftY);
  leftY = drawNameOnlyHeader(doc, innerLeft, leftY);
  leftY = drawNameOnlyRows(
    doc,
    battlefieldCards,
    Math.max(battlefieldCards.length, 3) + 1,
    innerLeft,
    leftY,
    colWidth,
  );
  leftY += 3;

  // Main Deck
  leftY = drawSectionLabel(doc, "Main Deck", innerLeft, leftY);
  leftY = drawQtyNameHeader(doc, innerLeft, leftY);

  // Merge champion into main deck: champion goes first with "Chosen Champion" label
  const mainWithChampion = [...championCards, ...mainCards];

  // Draw "Chosen Champion" icon/label on the first row area
  if (championCards.length > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(5.5);
    doc.setTextColor(100, 100, 100);
    doc.text("Chosen", innerLeft + colWidth - 16, leftY + 2.5);
    doc.text("Champion", innerLeft + colWidth - 16, leftY + 5);
    doc.setTextColor(0, 0, 0);
  }

  // Calculate how many main deck rows we can fit in the left column
  const remainingLeftSpace = cardAreaBottom - leftY - padding;
  const maxLeftMainRows = Math.floor(remainingLeftSpace / ROW_HEIGHT);
  const leftMainRowCount = Math.min(mainWithChampion.length, maxLeftMainRows);
  const leftMainTotalRows = maxLeftMainRows;
  const leftMainCards = mainWithChampion.slice(0, leftMainRowCount);

  leftY = drawQtyNameRows(doc, leftMainCards, leftMainTotalRows, innerLeft, leftY, colWidth);

  // ── RIGHT COLUMN ────────────────────────────────────────────────────────

  // Main Deck Continued
  const rightMainCards = mainWithChampion.slice(leftMainRowCount);
  rightY = drawSectionLabel(doc, "Main Deck Continued", rightColX, rightY);
  rightY = drawQtyNameHeader(doc, rightColX, rightY);

  // Calculate space needed for Runes and Sideboard at bottom of right column
  const runeRowCount = Math.max(runeCards.length, 2);
  const sideboardRowCount = Math.max(sideboardCards.length, 4) + 2;
  const runesHeight = 6 + 5 + runeRowCount * ROW_HEIGHT + 3;
  const sideboardHeight = 6 + 5 + sideboardRowCount * ROW_HEIGHT;
  const footerHeight = 28;
  const bottomReserved = runesHeight + sideboardHeight + footerHeight;

  const remainingRightForMain = cardAreaBottom - rightY - bottomReserved - padding;
  const rightMainTotalRows = Math.max(
    Math.floor(remainingRightForMain / ROW_HEIGHT),
    rightMainCards.length + 2,
  );

  rightY = drawQtyNameRows(doc, rightMainCards, rightMainTotalRows, rightColX, rightY, colWidth);
  rightY += 3;

  // Runes
  rightY = drawSectionLabel(doc, "Runes", rightColX, rightY);
  rightY = drawQtyNameHeader(doc, rightColX, rightY);
  rightY = drawQtyNameRows(doc, runeCards, runeRowCount, rightColX, rightY, colWidth);
  rightY += 3;

  // Sideboard
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
  rightY = drawQtyNameRows(doc, sideboardCards, sideboardRowCount, rightColX, rightY, colWidth);
  rightY += 5;

  // ── Footer ──────────────────────────────────────────────────────────────

  drawFooter(doc, rightColX, rightY, colWidth);

  // ── Branding bar ────────────────────────────────────────────────────────

  const barY = page.height - 5;
  doc.setFillColor(30, 30, 30);
  doc.rect(0, barY, page.width, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text("openrift.app", page.width / 2, barY + 3.5, { align: "center" });

  // ── Download ────────────────────────────────────────────────────────────

  const safeName = fields.deckName
    .replaceAll(/[^\w\s-]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-");
  doc.save(`${safeName || "deck"}-registration.pdf`);
}
