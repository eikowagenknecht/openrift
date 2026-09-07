import { SIDEBOARD_MAXIMUM } from "@openrift/shared/deck-rules";
import type { DeckZone } from "@openrift/shared/types/enums";
import { legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import type { jsPDF } from "jspdf";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { createPdfDocument } from "@/lib/pdf-document";
import { loadLogoDataUrl } from "@/lib/pdf-logo";

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

const MARGIN_TOP = 8;
const LEFT_MARGIN_WIDTH = 18;
const RIGHT_MARGIN = 10;
const ROW_HEIGHT = 5.5;
const BODY_FONT_SIZE = 9;
const SMALL_FONT_SIZE = 7;
const SECTION_HEADER_FONT_SIZE = 10;
const TITLE_FONT_SIZE = 16;
const COL_GAP = 4;
const LOGO_SIZE = 24;
const FIRST_LETTER_BOX_SIZE = 10;

interface RegistrationCard {
  name: string;
  quantity: number;
}

function cardsForZone(cards: DeckBuilderCard[], zone: DeckZone): RegistrationCard[] {
  return cards
    .filter((card) => card.zone === zone)
    .map((card) => ({
      name: legendDisplayName({ name: card.cardName, types: card.cardTypes, tags: card.tags }),
      quantity: card.quantity,
    }))
    .toSorted((first, second) => first.name.localeCompare(second.name));
}

function drawLeftMargin(
  doc: jsPDF,
  fields: RegistrationFields,
  cardAreaTop: number,
  cardAreaBottom: number,
): void {
  const marginX = LEFT_MARGIN_WIDTH;

  const totalHeight = cardAreaBottom - cardAreaTop;
  const zoneHeight = totalHeight / 3;

  const riotZoneTop = cardAreaTop;
  const firstZoneTop = cardAreaTop + zoneHeight;
  const lastZoneTop = cardAreaTop + 2 * zoneHeight;

  const marginLeft = 15;
  const textX = marginLeft;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(10, firstZoneTop, marginX, firstZoneTop);
  doc.line(10, lastZoneTop, marginX, lastZoneTop);
  doc.setLineWidth(0.2);

  // With angle: 90, text reads bottom-to-top; the value is anchored above the
  // label by the label's own measured width.
  const anchorOffset = 3;
  const labelFontSize = 7;
  const valueFontSize = 14;

  function drawZoneLabel(label: string, value: string, zoneTop: number) {
    const anchorY = zoneTop + zoneHeight - anchorOffset;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(labelFontSize);
    doc.setTextColor(100, 100, 100);
    doc.text(label, textX, anchorY, { angle: 90 });
    const labelWidth = doc.getTextWidth(label);

    if (value) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(valueFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text(value, textX, anchorY - labelWidth - 2, { angle: 90 });
    }
  }

  drawZoneLabel("Riot ID:", fields.riotId, riotZoneTop);
  drawZoneLabel("First Name:", fields.firstName, firstZoneTop);
  drawZoneLabel("Last Name:", fields.lastName, lastZoneTop);

  doc.setTextColor(0, 0, 0);
}

function drawHeader(
  doc: jsPDF,
  fields: RegistrationFields,
  logoDataUrl: string | null,
  pageWidth: number,
  siteUrl: string,
): number {
  let currentY = MARGIN_TOP;

  const contentLeft = LEFT_MARGIN_WIDTH;
  const contentRight = pageWidth - RIGHT_MARGIN;

  const logoX = MARGIN_TOP;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", logoX, currentY, LOGO_SIZE, LOGO_SIZE);
    } catch {
      // Skip the logo if the PDF library rejects it.
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  doc.setTextColor(100, 100, 100);
  const brandHost = siteUrl.replace(/^https?:\/\//u, "");
  const brandText = `Generated with ${brandHost}`;
  const brandTextWidth = doc.getTextWidth(brandText);
  const brandX = logoX + LOGO_SIZE / 2 - brandTextWidth / 2;
  const brandY = currentY + LOGO_SIZE + 3;
  doc.text(brandText, brandX, brandY);
  doc.link(brandX, brandY - 2, brandTextWidth, 3, { url: siteUrl });
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(TITLE_FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  const titleX = logoX + LOGO_SIZE + 4;
  doc.text("DECK REGISTRATION SHEET", titleX, currentY + 8);

  const boxX = contentRight - FIRST_LETTER_BOX_SIZE;
  const boxY = currentY + 14 - FIRST_LETTER_BOX_SIZE;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(0, 0, 0);
  const flMargin = 1.5;
  doc.text("First Letter of", boxX - flMargin, boxY + FIRST_LETTER_BOX_SIZE - flMargin - 3, {
    align: "right",
  });
  doc.text("Last Name", boxX - flMargin, boxY + FIRST_LETTER_BOX_SIZE - flMargin, {
    align: "right",
  });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(boxX, boxY, FIRST_LETTER_BOX_SIZE, FIRST_LETTER_BOX_SIZE);
  doc.setLineWidth(0.2);

  if (fields.lastName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(
      fields.lastName.charAt(0).toUpperCase(),
      boxX + FIRST_LETTER_BOX_SIZE / 2,
      boxY + FIRST_LETTER_BOX_SIZE / 2 + 2,
      { align: "center" },
    );
  }

  const infoY = currentY + 14;
  const infoLeft = logoX + LOGO_SIZE + 4;
  const infoRight = contentRight;
  const infoWidth = infoRight - infoLeft;
  const halfInfoWidth = infoWidth / 2;
  const infoRowHeight = 8;
  const labelColWidth = 22;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);

  doc.rect(infoLeft, infoY, halfInfoWidth, infoRowHeight);
  doc.rect(infoLeft + halfInfoWidth, infoY, halfInfoWidth, infoRowHeight);

  doc.rect(infoLeft, infoY + infoRowHeight, halfInfoWidth, infoRowHeight);
  doc.rect(infoLeft + halfInfoWidth, infoY + infoRowHeight, halfInfoWidth, infoRowHeight);

  doc.rect(infoLeft + halfInfoWidth, infoY + 2 * infoRowHeight, halfInfoWidth, infoRowHeight);

  doc.setLineWidth(0.2);

  const textY1 = infoY + 5.5;
  const textY2 = infoY + infoRowHeight + 5.5;
  const textY3 = infoY + 2 * infoRowHeight + 5.5;

  doc.setFontSize(8);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Date:", infoLeft + labelColWidth - 1, textY1, { align: "right" });
  doc.setTextColor(0, 0, 0);
  if (fields.eventDate) {
    doc.text(fields.eventDate, infoLeft + labelColWidth + 2, textY1);
  }

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Event:", infoLeft + halfInfoWidth + labelColWidth - 1, textY1, { align: "right" });
  doc.setTextColor(0, 0, 0);
  if (fields.eventName) {
    doc.text(fields.eventName, infoLeft + halfInfoWidth + labelColWidth + 2, textY1);
  }

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Location:", infoLeft + labelColWidth - 1, textY2, { align: "right" });
  doc.setTextColor(0, 0, 0);
  if (fields.eventLocation) {
    doc.text(fields.eventLocation, infoLeft + labelColWidth + 2, textY2);
  }

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Deck Name:", infoLeft + halfInfoWidth + labelColWidth - 1, textY2, { align: "right" });
  doc.setTextColor(0, 0, 0);
  if (fields.deckName) {
    doc.text(fields.deckName, infoLeft + halfInfoWidth + labelColWidth + 2, textY2);
  }

  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Deck Designer:", infoLeft + halfInfoWidth + labelColWidth - 1, textY3, {
    align: "right",
  });
  doc.setTextColor(0, 0, 0);
  if (fields.deckDesigner) {
    doc.text(fields.deckDesigner, infoLeft + halfInfoWidth + labelColWidth + 2, textY3);
  }

  currentY = infoY + 2 * infoRowHeight + 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("PRINT CLEARLY USING ENGLISH CARD NAMES", contentLeft, currentY + 5);

  currentY += 8;

  return currentY;
}

function drawSectionLabel(
  doc: jsPDF,
  label: string,
  startX: number,
  startY: number,
  subtitle?: string,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(SECTION_HEADER_FONT_SIZE);
  doc.setTextColor(0, 0, 0);
  doc.text(`${label}:`, startX, startY + 4);
  if (subtitle) {
    const labelWidth = doc.getTextWidth(`${label}:  `);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    doc.text(subtitle, startX + labelWidth, startY + 4);
    doc.setTextColor(0, 0, 0);
  }
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

    currentY += ROW_HEIGHT;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.line(startX, currentY, startX + 12, currentY);
    doc.line(startX + 18, currentY, startX + width, currentY);
  }

  return currentY;
}

function drawFooter(doc: jsPDF, startX: number, startY: number, width: number): number {
  const boxWidth = width;
  const boxHeight = 22;
  const halfWidth = boxWidth / 2;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(startX, startY, boxWidth, boxHeight);
  doc.setLineWidth(0.2);

  // The typo matches the Piltover Archive sheet on purpose.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(0, 0, 0);
  doc.text("FOR OFFICAL USE ONLY", startX + 2, startY + 3.5);

  const mainSbX = startX + halfWidth + 2;
  doc.text("Main/SB:", mainSbX, startY + 3.5);
  const mainSbLabelEnd = mainSbX + doc.getTextWidth("Main/SB:");
  const slashCenterX = mainSbLabelEnd + (startX + boxWidth - mainSbLabelEnd) / 2;
  doc.setFont("helvetica", "normal");
  doc.text("/", slashCenterX, startY + 3.5, { align: "center" });

  doc.line(startX, startY + 5, startX + boxWidth, startY + 5);
  doc.line(startX + halfWidth, startY + 5, startX + halfWidth, startY + boxHeight);

  const leftX = startX + 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(SMALL_FONT_SIZE);

  doc.text("Deck Check Rd #:", leftX, startY + 9);
  doc.text("Status:", leftX, startY + 14);
  doc.text("Judge:", leftX, startY + 19);

  const rightX = startX + halfWidth + 2;
  doc.text("Deck Check Rd #:", rightX, startY + 9);
  doc.text("Status:", rightX, startY + 14);
  doc.text("Judge:", rightX, startY + 19);

  return startY + boxHeight;
}

export async function generateRegistrationPdf(
  fields: RegistrationFields,
  cards: DeckBuilderCard[],
  pageSize: RegistrationPageSize,
  siteUrl: string,
): Promise<void> {
  const page = PAGE_SIZES[pageSize];
  const doc = createPdfDocument({
    orientation: "portrait",
    unit: "mm",
    format: pageSize === "a4" ? "a4" : "letter",
  });

  const contentLeft = LEFT_MARGIN_WIDTH;
  const contentRight = page.width - RIGHT_MARGIN;
  const contentWidth = contentRight - contentLeft;

  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await loadLogoDataUrl();
  } catch {
    // Skip the logo if it can't be loaded.
  }

  const cardAreaTop = drawHeader(doc, fields, logoDataUrl, page.width, siteUrl);

  const cardAreaBottom = page.height - 12;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.rect(contentLeft, cardAreaTop, contentWidth, cardAreaBottom - cardAreaTop);
  doc.setLineWidth(0.2);

  drawLeftMargin(doc, fields, cardAreaTop, cardAreaBottom);

  const padding = 3;
  const innerLeft = contentLeft + padding;
  const colWidth = (contentWidth - COL_GAP - 2 * padding) / 2;
  const rightColX = contentLeft + contentWidth / 2 + COL_GAP / 2;

  let leftY = cardAreaTop + padding;
  let rightY = cardAreaTop + padding;

  const legendCards = cardsForZone(cards, WellKnown.deckZone.LEGEND);
  const battlefieldCards = cardsForZone(cards, WellKnown.deckZone.BATTLEFIELD);
  const championCards = cardsForZone(cards, WellKnown.deckZone.CHAMPION);
  const mainCards = cardsForZone(cards, WellKnown.deckZone.MAIN);
  const runeCards = cardsForZone(cards, WellKnown.deckZone.RUNES);
  const sideboardCards = cardsForZone(cards, WellKnown.deckZone.SIDEBOARD);

  leftY = drawSectionLabel(doc, "Legend", innerLeft, leftY, "(1 card)");
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

  leftY = drawSectionLabel(doc, "Battlefields", innerLeft, leftY, "(3 cards)");
  leftY = drawNameOnlyHeader(doc, innerLeft, leftY);
  leftY = drawNameOnlyRows(doc, battlefieldCards, 3, innerLeft, leftY, colWidth);
  leftY += 3;

  leftY = drawSectionLabel(doc, "Main Deck", innerLeft, leftY, "(40 cards)");
  leftY = drawQtyNameHeader(doc, innerLeft, leftY);

  const championNames = new Set(championCards.map((card) => card.name));
  const nonChampionCards = mainCards
    .filter((card) => !championNames.has(card.name))
    .toSorted((first, second) => first.name.localeCompare(second.name));
  const mergedChampionCards: RegistrationCard[] = [];
  for (const champ of championCards) {
    const mainCopy = mainCards.find((card) => card.name === champ.name);
    mergedChampionCards.push({
      name: champ.name,
      quantity: champ.quantity + (mainCopy?.quantity ?? 0),
    });
  }
  const allMainCards = [...mergedChampionCards, ...nonChampionCards];

  if (championCards.length > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("Chosen Champion", innerLeft + colWidth, leftY + 3.5, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  const TOTAL_MAIN_ROWS = 40;
  const remainingLeftSpace = cardAreaBottom - leftY - padding;
  const leftMainTotalRows = Math.floor(remainingLeftSpace / ROW_HEIGHT);
  const rightMainTotalRows = TOTAL_MAIN_ROWS - leftMainTotalRows;

  const leftMainCards = allMainCards.slice(0, leftMainTotalRows);
  leftY = drawQtyNameRows(doc, leftMainCards, leftMainTotalRows, innerLeft, leftY, colWidth);

  const rightMainCards = allMainCards.slice(leftMainTotalRows);
  rightY = drawSectionLabel(doc, "Main Deck Continued", rightColX, rightY);
  rightY = drawQtyNameHeader(doc, rightColX, rightY);

  rightY = drawQtyNameRows(doc, rightMainCards, rightMainTotalRows, rightColX, rightY, colWidth);
  rightY += 3;

  const runeRowCount = Math.max(runeCards.length, 2);
  rightY = drawSectionLabel(doc, "Runes", rightColX, rightY, "(12 cards)");
  rightY = drawQtyNameHeader(doc, rightColX, rightY);
  rightY = drawQtyNameRows(doc, runeCards, runeRowCount, rightColX, rightY, colWidth);
  rightY += 3;

  rightY = drawSectionLabel(doc, "Sideboard", rightColX, rightY, `(0-${SIDEBOARD_MAXIMUM} cards)`);

  rightY = drawQtyNameHeader(doc, rightColX, rightY);
  rightY = drawQtyNameRows(doc, sideboardCards, SIDEBOARD_MAXIMUM, rightColX, rightY, colWidth);

  const footerBoxHeight = 22;
  drawFooter(doc, rightColX, cardAreaBottom - footerBoxHeight - padding, colWidth);

  const safeName = fields.deckName
    .replaceAll(/[^\w\s-]/gu, "")
    .trim()
    .replaceAll(/\s+/gu, "-");
  doc.save(`${safeName || "deck"}-registration.pdf`);
}
