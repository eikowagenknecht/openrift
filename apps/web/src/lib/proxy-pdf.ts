import type { Card, CatalogResponse, Printing } from "@openrift/shared";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { getCardImageUrl } from "@/lib/images";
import type { DeckBuilderCard } from "@/stores/deck-builder-store";

export type ProxyPageSize = "a4" | "letter";
export type ProxyRenderMode = "image" | "text";

export interface ProxyOptions {
  pageSize: ProxyPageSize;
  renderMode: ProxyRenderMode;
  cutLines: boolean;
  watermark: boolean;
}

// Card dimensions in mm (standard poker/MTG size)
const CARD_WIDTH_MM = 63;
const CARD_HEIGHT_MM = 88;

const COLS = 3;
const ROWS = 3;
const CARDS_PER_PAGE = COLS * ROWS;

const PAGE_SIZES = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
} as const;

interface ProxyCard {
  cardId: string;
  name: string;
  imageUrl: string | null;
  card: Card;
  flavorText: string | null;
}

/**
 * Resolves deck builder cards to full card + printing data needed for proxy generation.
 * @returns Flat array of ProxyCard entries with quantities expanded (one entry per copy).
 */
function resolveProxyCards(deckCards: DeckBuilderCard[], catalog: CatalogResponse): ProxyCard[] {
  const cardsById = catalog.cards;
  const printingByCardId = new Map<string, Printing & { setSlug: string }>();
  const slugById = new Map(catalog.sets.map((set) => [set.id, set.slug]));
  for (const printing of catalog.printings) {
    if (!printingByCardId.has(printing.cardId)) {
      const setSlug = slugById.get(printing.setId);
      const card = cardsById[printing.cardId];
      if (setSlug && card) {
        printingByCardId.set(printing.cardId, { ...printing, setSlug, card });
      }
    }
  }

  const result: ProxyCard[] = [];
  for (const deckCard of deckCards) {
    const card = cardsById[deckCard.cardId];
    if (!card) {
      continue;
    }
    const printing = printingByCardId.get(deckCard.cardId);
    const imageUrl = printing?.images[0]?.url ?? null;
    const flavorText = printing?.flavorText ?? null;

    for (let copy = 0; copy < deckCard.quantity; copy++) {
      result.push({ cardId: deckCard.cardId, name: card.name, imageUrl, card, flavorText });
    }
  }
  return result;
}

/**
 * Loads an image from a URL and returns it as an HTMLImageElement.
 * @returns The loaded image element.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping callback-based Image loading API
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = url;
  });
}

// Render resolution — higher = sharper print but larger file
const RENDER_WIDTH_PX = 400;
const RENDER_HEIGHT_PX = Math.round(RENDER_WIDTH_PX * (CARD_HEIGHT_MM / CARD_WIDTH_MM));

/**
 * Renders a CardPlaceholderImage (light variant) to a canvas via html2canvas.
 * @returns The rasterized canvas element.
 */
async function renderPlaceholderToCanvas(proxyCard: ProxyCard): Promise<HTMLCanvasElement> {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = `${RENDER_WIDTH_PX}px`;
  document.body.append(container);

  const root = createRoot(container);

  // oxlint-disable-next-line promise/avoid-new -- need to wait for React render + setTimeout
  await new Promise<void>((resolve) => {
    root.render(
      createElement(CardPlaceholderImage, {
        name: proxyCard.card.name,
        domain: proxyCard.card.domains,
        energy: proxyCard.card.energy,
        might: proxyCard.card.might,
        power: proxyCard.card.power,
        type: proxyCard.card.type,
        superTypes: proxyCard.card.superTypes,
        tags: proxyCard.card.tags,
        rulesText: proxyCard.card.rulesText,
        effectText: proxyCard.card.effectText,
        mightBonus: proxyCard.card.mightBonus,
        flavorText: proxyCard.flavorText,
        variant: "light",
      }),
    );
    // Wait for React render + images to load
    setTimeout(resolve, 100);
  });

  const canvas = await html2canvas(container, {
    width: RENDER_WIDTH_PX,
    height: RENDER_HEIGHT_PX,
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  root.unmount();
  container.remove();
  return canvas;
}

/**
 * Draws a "PROXY" watermark diagonally across a card slot.
 */
function drawWatermark(doc: jsPDF, slotX: number, slotY: number): void {
  const centerX = slotX + CARD_WIDTH_MM / 2;
  const centerY = slotY + CARD_HEIGHT_MM / 2;

  doc.setTextColor(200, 200, 200);
  doc.setFontSize(18);
  doc.text("PROXY", centerX, centerY, {
    align: "center",
    baseline: "middle",
    angle: -35,
  });
}

/**
 * Draws cut lines on the page for the given grid layout.
 */
function drawCutLines(
  doc: jsPDF,
  marginX: number,
  marginY: number,
  pageWidth: number,
  pageHeight: number,
): void {
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);

  for (let col = 0; col <= COLS; col++) {
    const lineX = marginX + col * CARD_WIDTH_MM;
    doc.line(lineX, 0, lineX, pageHeight);
  }

  for (let row = 0; row <= ROWS; row++) {
    const lineY = marginY + row * CARD_HEIGHT_MM;
    doc.line(0, lineY, pageWidth, lineY);
  }
}

/**
 * Draws a fallback text rectangle when image/canvas rendering fails.
 */
function drawFallbackCard(doc: jsPDF, name: string, slotX: number, slotY: number): void {
  doc.setDrawColor(200, 200, 200);
  doc.rect(slotX, slotY, CARD_WIDTH_MM, CARD_HEIGHT_MM);
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(name, slotX + CARD_WIDTH_MM / 2, slotY + CARD_HEIGHT_MM / 2, {
    align: "center",
    baseline: "middle",
  });
}

/**
 * Generates a proxy PDF from deck cards and triggers a browser download.
 * @returns void
 */
export async function generateProxyPdf(
  deckCards: DeckBuilderCard[],
  catalog: CatalogResponse,
  options: ProxyOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const proxyCards = resolveProxyCards(deckCards, catalog);
  if (proxyCards.length === 0) {
    return;
  }

  const page = PAGE_SIZES[options.pageSize];
  const marginX = (page.width - COLS * CARD_WIDTH_MM) / 2;
  const marginY = (page.height - ROWS * CARD_HEIGHT_MM) / 2;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: options.pageSize === "a4" ? "a4" : "letter",
  });

  const totalPages = Math.ceil(proxyCards.length / CARDS_PER_PAGE);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage();
    }

    if (options.cutLines) {
      drawCutLines(doc, marginX, marginY, page.width, page.height);
    }

    const pageStart = pageIdx * CARDS_PER_PAGE;
    const pageEnd = Math.min(pageStart + CARDS_PER_PAGE, proxyCards.length);

    for (let cardIdx = pageStart; cardIdx < pageEnd; cardIdx++) {
      const slotIdx = cardIdx - pageStart;
      const col = slotIdx % COLS;
      const row = Math.floor(slotIdx / COLS);
      const slotX = marginX + col * CARD_WIDTH_MM;
      const slotY = marginY + row * CARD_HEIGHT_MM;

      const proxyCard = proxyCards[cardIdx];
      onProgress?.(cardIdx + 1, proxyCards.length);

      if (options.renderMode === "image" && proxyCard.imageUrl) {
        try {
          const fullUrl = getCardImageUrl(proxyCard.imageUrl, "full");
          const img = await loadImage(fullUrl);
          doc.addImage(img, "WEBP", slotX, slotY, CARD_WIDTH_MM, CARD_HEIGHT_MM);
        } catch {
          drawFallbackCard(doc, proxyCard.name, slotX, slotY);
        }
      } else {
        try {
          const canvas = await renderPlaceholderToCanvas(proxyCard);
          const dataUrl = canvas.toDataURL("image/png");
          doc.addImage(dataUrl, "PNG", slotX, slotY, CARD_WIDTH_MM, CARD_HEIGHT_MM);
        } catch {
          drawFallbackCard(doc, proxyCard.name, slotX, slotY);
        }
      }

      if (options.watermark) {
        drawWatermark(doc, slotX, slotY);
      }
    }
  }

  doc.save("proxies.pdf");
}
