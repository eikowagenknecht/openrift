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

// Render resolution for rasterization
const RENDER_WIDTH_PX = 504; // 63mm * 8px/mm
const RENDER_HEIGHT_PX = 704; // 88mm * 8px/mm

interface RenderedCard {
  dataUrl: string;
  rotated: boolean;
}

/**
 * Loads an image URL and converts it to a portrait-oriented PNG data URL via canvas.
 * Detects landscape images (wider than tall) and rotates them -90° to fit portrait slots.
 * @returns Rendered card with data URL and rotation flag.
 */
async function loadImageAsDataUrl(url: string): Promise<RenderedCard> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping callback-based Image loading API
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = url;
  });

  const isLandscape = img.naturalWidth > img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = RENDER_WIDTH_PX;
  canvas.height = RENDER_HEIGHT_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas 2d context");
  }

  if (isLandscape) {
    // Rotate landscape image -90° to fit portrait card slot
    ctx.translate(0, RENDER_HEIGHT_PX);
    ctx.rotate(-Math.PI / 2);
    // After rotation, draw into the rotated coordinate space (swapped dimensions)
    ctx.drawImage(img, 0, 0, RENDER_HEIGHT_PX, RENDER_WIDTH_PX);
  } else {
    ctx.drawImage(img, 0, 0, RENDER_WIDTH_PX, RENDER_HEIGHT_PX);
  }

  return { dataUrl: canvas.toDataURL("image/png"), rotated: isLandscape };
}

/**
 * Renders a CardPlaceholderImage (light variant) to a PNG data URL via html2canvas.
 * Uses a visible but clipped container so stylesheets apply correctly.
 * @returns Rendered card with data URL (never rotated — placeholders are always portrait).
 */
async function renderPlaceholderToDataUrl(proxyCard: ProxyCard): Promise<RenderedCard> {
  // Create a container that's visible to the rendering engine (so styles apply)
  // but clipped so it's not visible to the user
  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: ${RENDER_WIDTH_PX}px;
    height: ${RENDER_HEIGHT_PX}px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    pointer-events: none;
    z-index: -9999;
  `;
  document.body.append(container);

  const root = createRoot(container);

  // oxlint-disable-next-line promise/avoid-new -- need to wait for React render via requestAnimationFrame
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
    // Wait two frames: one for React to commit, one for browser to compute styles
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  // Temporarily make visible for html2canvas (it needs computed styles)
  container.style.clip = "auto";
  container.style.clipPath = "none";

  const canvas = await html2canvas(container, {
    width: RENDER_WIDTH_PX,
    height: RENDER_HEIGHT_PX,
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const dataUrl = canvas.toDataURL("image/png");
  root.unmount();
  container.remove();
  return { dataUrl, rotated: false };
}

/**
 * Draws a "PROXY" pill badge at the top of a card slot.
 * For rotated (landscape) cards, the pill is placed along the right edge
 * (which is the visual top after rotation) and rotated -90°.
 */
function drawWatermark(doc: jsPDF, slotX: number, slotY: number, rotated: boolean): void {
  const label = "PROXY";
  const fontSize = 7;
  const paddingX = 3;
  const paddingY = 1.2;
  const edgeOffset = 2.5;

  doc.setFontSize(fontSize);
  const textWidth = doc.getTextWidth(label);
  const pillWidth = textWidth + paddingX * 2;
  const pillHeight = fontSize * 0.35 + paddingY * 2;

  if (rotated) {
    // Card image was rotated -90° so visual top is at the right edge of the slot.
    // Draw a vertical pill along the right edge with text rotated 90°.
    const vertPillX = slotX + CARD_WIDTH_MM - edgeOffset - pillHeight;
    const vertPillY = slotY + (CARD_HEIGHT_MM - pillWidth) / 2;

    doc.setFillColor(0, 0, 0);
    doc.roundedRect(vertPillX, vertPillY, pillHeight, pillWidth, 1.5, 1.5, "F");

    doc.setTextColor(255, 255, 255);
    doc.text(label, vertPillX + pillHeight / 2, vertPillY + pillWidth / 2, {
      align: "center",
      baseline: "middle",
      angle: 90,
    });
  } else {
    const pillX = slotX + (CARD_WIDTH_MM - pillWidth) / 2;
    const pillY = slotY + edgeOffset;

    doc.setFillColor(0, 0, 0);
    doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 1.5, 1.5, "F");

    doc.setTextColor(255, 255, 255);
    doc.text(label, pillX + pillWidth / 2, pillY + pillHeight / 2, {
      align: "center",
      baseline: "middle",
    });
  }
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
 * Pre-renders all unique cards and returns a map of cardId → PNG data URL.
 * Deduplicates so each card is only rendered once regardless of quantity.
 * @returns Map from cardId to PNG data URL.
 */
async function prerenderCards(
  proxyCards: ProxyCard[],
  renderMode: ProxyRenderMode,
  onProgress?: (current: number, total: number) => void,
): Promise<Map<string, RenderedCard>> {
  const uniqueCards = new Map<string, ProxyCard>();
  for (const proxyCard of proxyCards) {
    if (!uniqueCards.has(proxyCard.cardId)) {
      uniqueCards.set(proxyCard.cardId, proxyCard);
    }
  }

  const rendered = new Map<string, RenderedCard>();
  let completed = 0;
  const total = uniqueCards.size;

  for (const [cardId, proxyCard] of uniqueCards) {
    onProgress?.(++completed, total);

    try {
      if (renderMode === "image" && proxyCard.imageUrl) {
        const fullUrl = getCardImageUrl(proxyCard.imageUrl, "full");
        rendered.set(cardId, await loadImageAsDataUrl(fullUrl));
      } else {
        rendered.set(cardId, await renderPlaceholderToDataUrl(proxyCard));
      }
    } catch (error) {
      console.error(`Failed to render card "${proxyCard.name}":`, error);
      // Leave missing — fallback will be drawn in the PDF loop
    }
  }

  return rendered;
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

  // Pre-render all unique cards (deduped) so repeated cards reuse the same image
  const renderedCards = await prerenderCards(proxyCards, options.renderMode, onProgress);

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
      const rendered = renderedCards.get(proxyCard.cardId);

      if (rendered) {
        doc.addImage(rendered.dataUrl, "PNG", slotX, slotY, CARD_WIDTH_MM, CARD_HEIGHT_MM);
      } else {
        drawFallbackCard(doc, proxyCard.name, slotX, slotY);
      }

      if (options.watermark) {
        drawWatermark(doc, slotX, slotY, rendered?.rotated ?? false);
      }
    }
  }

  doc.save("proxies.pdf");
}
