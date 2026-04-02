import type { DeckZone } from "@openrift/shared";
import { jsPDF } from "jspdf";

import type { DeckBuilderCard } from "@/stores/deck-builder-store";

export type RegistrationPageSize = "a4" | "letter";

const PAGE_SIZES = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
} as const;

// ── Layout constants (mm) ──────────────────────────────────────────────────

const MARGIN_X = 12;
const MARGIN_TOP = 8;
const SECTION_GAP = 2.5;
const ROW_HEIGHT = 4.8;
const QTY_COL_WIDTH = 10;
const HEADER_FONT_SIZE = 7.5;
const BODY_FONT_SIZE = 7;
const TITLE_FONT_SIZE = 16;
const SECTION_HEADER_HEIGHT = 5.5;
const LOGO_SIZE = 20;
const COL_GAP = 6;
const BRAND_COLOR = { r: 30, g: 30, b: 30 };
const BRAND_BAR_HEIGHT = 6;

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

function drawSectionHeader(
  doc: jsPDF,
  label: string,
  startX: number,
  startY: number,
  width: number,
): number {
  doc.setFillColor(BRAND_COLOR.r, BRAND_COLOR.g, BRAND_COLOR.b);
  doc.rect(startX, startY, width, SECTION_HEADER_HEIGHT, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(HEADER_FONT_SIZE);
  doc.setTextColor(255, 255, 255);
  doc.text(label, startX + 2, startY + 3.8);
  doc.setTextColor(0, 0, 0);
  return startY + SECTION_HEADER_HEIGHT;
}

function drawColumnHeaders(doc: jsPDF, startX: number, startY: number, width: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(BODY_FONT_SIZE);
  doc.setTextColor(120, 120, 120);
  doc.text("#", startX + QTY_COL_WIDTH / 2, startY + 3.2, { align: "center" });
  doc.text("Card Name", startX + QTY_COL_WIDTH + 2, startY + 3.2);
  doc.setDrawColor(200, 200, 200);
  doc.line(startX, startY + ROW_HEIGHT, startX + width, startY + ROW_HEIGHT);
  doc.setTextColor(0, 0, 0);
  return startY + ROW_HEIGHT;
}

function drawCardRows(
  doc: jsPDF,
  cards: RegistrationCard[],
  blankRows: number,
  startX: number,
  startY: number,
  width: number,
  zebra?: boolean,
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY_FONT_SIZE);

  const totalRows = Math.max(cards.length, blankRows);
  let currentY = startY;

  for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
    const card = cards[rowIndex];

    // Alternating row shading
    if (zebra && rowIndex % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(startX, currentY, width, ROW_HEIGHT, "F");
    }

    const rowY = currentY + 3.4;

    if (card) {
      doc.setTextColor(0, 0, 0);
      doc.text(String(card.quantity), startX + QTY_COL_WIDTH / 2, rowY, { align: "center" });
      doc.text(card.name, startX + QTY_COL_WIDTH + 2, rowY);
    }

    // Row separator
    doc.setDrawColor(230, 230, 230);
    currentY += ROW_HEIGHT;
    doc.line(startX, currentY, startX + width, currentY);
  }

  return currentY;
}

function drawSection(
  doc: jsPDF,
  label: string,
  cards: RegistrationCard[],
  blankRows: number,
  startX: number,
  startY: number,
  width: number,
  options?: { skipColumnHeaders?: boolean; zebra?: boolean },
): number {
  let currentY = drawSectionHeader(doc, label, startX, startY, width);
  if (!options?.skipColumnHeaders) {
    currentY = drawColumnHeaders(doc, startX, currentY, width);
  }
  currentY = drawCardRows(doc, cards, blankRows, startX, currentY, width, options?.zebra);
  return currentY;
}

// ── Info fields ────────────────────────────────────────────────────────────

function drawInfoFields(
  doc: jsPDF,
  deckName: string,
  startX: number,
  startY: number,
  pageWidth: number,
): number {
  const fieldWidth = (pageWidth - 2 * startX - COL_GAP) / 2;
  const fieldHeight = 6.5;
  const fieldGap = 2;

  const fields = [
    { label: "Date:", value: "", x: startX, y: startY },
    { label: "Event:", value: "", x: startX + fieldWidth + COL_GAP, y: startY },
    { label: "First / Last Name:", value: "", x: startX, y: startY + fieldHeight + fieldGap },
    {
      label: "Deck Name:",
      value: deckName,
      x: startX + fieldWidth + COL_GAP,
      y: startY + fieldHeight + fieldGap,
    },
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY_FONT_SIZE);

  for (const field of fields) {
    doc.setDrawColor(180, 180, 180);
    doc.rect(field.x, field.y, fieldWidth, fieldHeight);
    doc.setTextColor(120, 120, 120);
    doc.text(field.label, field.x + 2, field.y + 3);
    if (field.value) {
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text(field.value, field.x + 2 + doc.getTextWidth(`${field.label} `), field.y + 3);
      doc.setFont("helvetica", "normal");
    }
  }

  return startY + 2 * fieldHeight + fieldGap + 2;
}

// ── Footer ─────────────────────────────────────────────────────────────────

function drawFooter(
  doc: jsPDF,
  totalCards: number,
  startX: number,
  startY: number,
  pageWidth: number,
  pageHeight: number,
): void {
  const contentWidth = pageWidth - 2 * startX;

  // Total card count
  doc.setFont("helvetica", "bold");
  doc.setFontSize(BODY_FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total Cards in Main Deck: ${totalCards}/40`, startX, startY + 4);

  // Judge boxes
  const boxWidth = contentWidth / 2 - 3;
  const boxY = startY + 6;
  const boxHeight = 10;

  doc.setDrawColor(180, 180, 180);
  doc.rect(startX, boxY, boxWidth, boxHeight);
  doc.rect(startX + boxWidth + COL_GAP, boxY, boxWidth, boxHeight);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(120, 120, 120);
  doc.text("Deck Check 1 — Judge:", startX + 2, boxY + 4);
  doc.text("Status:", startX + 2, boxY + 8);
  doc.text("Deck Check 2 — Judge:", startX + boxWidth + COL_GAP + 2, boxY + 4);
  doc.text("Status:", startX + boxWidth + COL_GAP + 2, boxY + 8);
  doc.setTextColor(0, 0, 0);

  // ── Branding bar ────────────────────────────────────────────────────────
  const barY = pageHeight - BRAND_BAR_HEIGHT;
  doc.setFillColor(BRAND_COLOR.r, BRAND_COLOR.g, BRAND_COLOR.b);
  doc.rect(0, barY, pageWidth, BRAND_BAR_HEIGHT, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text("openrift.app", pageWidth / 2, barY + 4, { align: "center" });
}

// ── Logo ───────────────────────────────────────────────────────────────────

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
 * Generates a tournament deck registration sheet PDF.
 * @returns void — triggers browser download.
 */
export async function generateRegistrationPdf(
  deckName: string,
  cards: DeckBuilderCard[],
  pageSize: RegistrationPageSize,
): Promise<void> {
  const page = PAGE_SIZES[pageSize];
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: pageSize === "a4" ? "a4" : "letter",
  });

  const contentWidth = page.width - 2 * MARGIN_X;
  const halfWidth = (contentWidth - COL_GAP) / 2;

  // ── Title ──────────────────────────────────────────────────────────────

  let currentY = MARGIN_TOP;

  // Logo (centered above title)
  try {
    const logoDataUrl = await loadLogoDataUrl();
    doc.addImage(
      logoDataUrl,
      "PNG",
      page.width / 2 - LOGO_SIZE / 2,
      currentY,
      LOGO_SIZE,
      LOGO_SIZE,
    );
  } catch {
    // Skip logo if loading fails
  }

  currentY += LOGO_SIZE + 1;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(TITLE_FONT_SIZE);
  doc.text("DECK REGISTRATION SHEET", page.width / 2, currentY, { align: "center" });

  currentY += 3;

  // Thin accent line under title
  doc.setDrawColor(BRAND_COLOR.r, BRAND_COLOR.g, BRAND_COLOR.b);
  doc.setLineWidth(0.6);
  const lineHalf = 40;
  doc.line(page.width / 2 - lineHalf, currentY, page.width / 2 + lineHalf, currentY);
  doc.setLineWidth(0.2);

  currentY += 2.5;

  // ── Player / event info ────────────────────────────────────────────────

  currentY = drawInfoFields(doc, deckName, MARGIN_X, currentY, page.width);
  currentY += SECTION_GAP;

  // ── Legend (left) | Chosen Champion (right) — 1 card each ─────────────

  const legendCards = cardsForZone(cards, "legend");
  const championCards = cardsForZone(cards, "champion");

  const legendEndY = drawSection(doc, "LEGEND", legendCards, 1, MARGIN_X, currentY, halfWidth, {
    skipColumnHeaders: true,
  });
  const champEndY = drawSection(
    doc,
    "CHOSEN CHAMPION",
    championCards,
    1,
    MARGIN_X + halfWidth + COL_GAP,
    currentY,
    halfWidth,
    { skipColumnHeaders: true },
  );

  currentY = Math.max(legendEndY, champEndY) + SECTION_GAP;

  // ── Runes (left) | Battlefields (right) ────────────────────────────────

  const runeCards = cardsForZone(cards, "runes");
  const battlefieldCards = cardsForZone(cards, "battlefield");

  const runesEndY = drawSection(doc, "RUNES", runeCards, 2, MARGIN_X, currentY, halfWidth);
  const bfEndY = drawSection(
    doc,
    "BATTLEFIELDS",
    battlefieldCards,
    3,
    MARGIN_X + halfWidth + COL_GAP,
    currentY,
    halfWidth,
  );

  currentY = Math.max(runesEndY, bfEndY) + SECTION_GAP;

  // ── Main Deck (2 columns, 39 rows total) ──────────────────────────────

  const mainCards = cardsForZone(cards, "main");
  const midpoint = Math.ceil(mainCards.length / 2);
  const mainLeft = mainCards.slice(0, midpoint);
  const mainRight = mainCards.slice(midpoint);
  const mainBlankRowsLeft = 20;
  const mainBlankRowsRight = 19;

  // Shared header
  const mainY = drawSectionHeader(doc, "MAIN DECK", MARGIN_X, currentY, contentWidth);

  // Left column
  let leftY = drawColumnHeaders(doc, MARGIN_X, mainY, halfWidth);
  leftY = drawCardRows(doc, mainLeft, mainBlankRowsLeft, MARGIN_X, leftY, halfWidth, true);

  // Right column
  let rightY = drawColumnHeaders(doc, MARGIN_X + halfWidth + COL_GAP, mainY, halfWidth);
  rightY = drawCardRows(
    doc,
    mainRight,
    mainBlankRowsRight,
    MARGIN_X + halfWidth + COL_GAP,
    rightY,
    halfWidth,
    true,
  );

  currentY = Math.max(leftY, rightY) + SECTION_GAP;

  // ── Sideboard ──────────────────────────────────────────────────────────

  const sideboardCards = cardsForZone(cards, "sideboard");
  currentY = drawSection(doc, "SIDEBOARD", sideboardCards, 8, MARGIN_X, currentY, contentWidth, {
    zebra: true,
  });
  currentY += SECTION_GAP;

  // ── Footer ─────────────────────────────────────────────────────────────

  const mainTotal =
    mainCards.reduce((sum, card) => sum + card.quantity, 0) +
    championCards.reduce((sum, card) => sum + card.quantity, 0);
  drawFooter(doc, mainTotal, MARGIN_X, currentY, page.width, page.height);

  // ── Download ───────────────────────────────────────────────────────────

  const safeName = deckName
    .replaceAll(/[^\w\s-]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-");
  doc.save(`${safeName}-registration.pdf`);
}
