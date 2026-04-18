import type { Card, CatalogResponse, Printing, Rarity } from "@openrift/shared";
import { preferredPrinting } from "@openrift/shared";
import { jsPDF } from "jspdf";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

export type ProxyPageSize = "a4" | "letter";
export type ProxyRenderMode = "image" | "text";

interface ProxyOptions {
  pageSize: ProxyPageSize;
  renderMode: ProxyRenderMode;
  cutLines: boolean;
  watermark: boolean;
  deckName?: string;
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

export interface ProxyCard {
  cardId: string;
  printingId: string | null;
  name: string;
  imageFullUrl: string | null;
  card: Card;
  rarity: Rarity;
  publicCode: string;
  artist: string;
  flavorText: string | null;
  rulesText: string | null;
  effectText: string | null;
}

/**
 * Stable identifier for de-duping rendered cards. Two deck rows pinned to
 * different printings of the same card must render distinct images.
 * @returns The printing id when resolved, else the cardId as a fallback.
 */
export function proxyRenderKey(proxyCard: ProxyCard): string {
  return proxyCard.printingId ?? proxyCard.cardId;
}

/**
 * Resolves deck builder cards to full card + printing data needed for proxy generation.
 *
 * Picks the same printing the deck UI shows: an explicit `preferredPrintingId`
 * on the deck row wins; otherwise the user's language preference decides
 * (defaulting EN-first), via the shared `preferredPrinting` helper.
 * @returns Flat array of ProxyCard entries with quantities expanded (one entry per copy).
 */
export function resolveProxyCards(
  deckCards: DeckBuilderCard[],
  catalog: CatalogResponse,
  languages: string[],
): ProxyCard[] {
  const slugById = new Map(catalog.sets.map((set) => [set.id, set.slug]));
  const setOrderMap = new Map(catalog.sets.map((set, index) => [set.id, index]));
  const cardsById: Record<string, Card> = catalog.cards;

  type EnrichedPrinting = Printing & { id: string; setSlug: string };
  const printingById = new Map<string, EnrichedPrinting>();
  const printingsByCardId = new Map<string, EnrichedPrinting[]>();
  for (const [id, printing] of Object.entries(catalog.printings)) {
    const setSlug = slugById.get(printing.setId);
    const card = cardsById[printing.cardId];
    if (setSlug && card) {
      const enriched: EnrichedPrinting = { ...printing, id, setSlug, card };
      printingById.set(id, enriched);
      let group = printingsByCardId.get(printing.cardId);
      if (!group) {
        group = [];
        printingsByCardId.set(printing.cardId, group);
      }
      group.push(enriched);
    }
  }

  const result: ProxyCard[] = [];
  for (const deckCard of deckCards) {
    const card = cardsById[deckCard.cardId];
    if (!card) {
      continue;
    }
    let printing: EnrichedPrinting | undefined;
    if (deckCard.preferredPrintingId) {
      printing = printingById.get(deckCard.preferredPrintingId);
    }
    if (!printing) {
      const candidates = printingsByCardId.get(deckCard.cardId);
      if (candidates) {
        // Cast: shared helper returns one of the input items unchanged.
        printing = preferredPrinting(candidates, setOrderMap, languages) as
          | EnrichedPrinting
          | undefined;
      }
    }

    const imageFullUrl = printing?.images[0]?.full ?? null;
    const flavorText = printing?.flavorText ?? null;
    // Use printing-level text (falls back to errata if available)
    const rulesText = printing?.printedRulesText ?? card.errata?.correctedRulesText ?? null;
    const effectText = printing?.printedEffectText ?? card.errata?.correctedEffectText ?? null;

    for (let copy = 0; copy < deckCard.quantity; copy++) {
      result.push({
        cardId: deckCard.cardId,
        printingId: printing?.id ?? null,
        name: card.name,
        imageFullUrl,
        card,
        rarity: printing?.rarity ?? ("Common" as Rarity),
        publicCode: printing?.publicCode ?? "",
        artist: printing?.artist ?? "",
        flavorText,
        rulesText,
        effectText,
      });
    }
  }
  return result;
}

// Render resolution for rasterization
const RENDER_WIDTH_PX = 504; // 63mm * 8px/mm
const RENDER_HEIGHT_PX = 704; // 88mm * 8px/mm

export interface RenderedCard {
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
    ctx.translate(0, RENDER_HEIGHT_PX);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, 0, 0, RENDER_HEIGHT_PX, RENDER_WIDTH_PX);
  } else {
    ctx.drawImage(img, 0, 0, RENDER_WIDTH_PX, RENDER_HEIGHT_PX);
  }

  return { dataUrl: canvas.toDataURL("image/png"), rotated: isLandscape };
}

/**
 * Pre-renders image-mode cards. Text-mode cards are rendered by the React component.
 * @returns Map from {@link proxyRenderKey} to RenderedCard for image-mode cards only.
 */
export async function prerenderImageCards(
  proxyCards: ProxyCard[],
  onProgress?: (current: number, total: number) => void,
): Promise<Map<string, RenderedCard>> {
  const uniqueCards = new Map<string, ProxyCard>();
  for (const proxyCard of proxyCards) {
    const key = proxyRenderKey(proxyCard);
    if (!uniqueCards.has(key) && proxyCard.imageFullUrl) {
      uniqueCards.set(key, proxyCard);
    }
  }

  const rendered = new Map<string, RenderedCard>();
  let completed = 0;
  const total = uniqueCards.size;

  for (const [key, proxyCard] of uniqueCards) {
    onProgress?.(++completed, total);
    if (!proxyCard.imageFullUrl) {
      continue;
    }
    try {
      rendered.set(key, await loadImageAsDataUrl(proxyCard.imageFullUrl));
    } catch (error) {
      console.error(`Failed to render card "${proxyCard.name}":`, error);
    }
  }

  return rendered;
}

/**
 * Loads the OpenRift logo as a PNG data URL for embedding in the PDF.
 * @returns PNG data URL of the logo.
 */
let cachedLogoDataUrl: string | null = null;
async function loadLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) {
    return cachedLogoDataUrl;
  }

  // oxlint-disable-next-line promise/avoid-new -- wrapping callback-based Image loading API
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = "/logo-64x64.webp";
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

/**
 * Draws a "PROXY" pill badge with OpenRift logo centered at the top of a card slot.
 */
async function drawWatermark(doc: jsPDF, slotX: number, slotY: number): Promise<void> {
  const label = "PROXY";
  const fontSize = 7;
  const paddingX = 2.5;
  const paddingY = 1.2;
  const topOffset = 2.5;
  const logoSize = fontSize * 0.35 + paddingY;
  const logoGap = 1;

  doc.setFontSize(fontSize);
  const textWidth = doc.getTextWidth(label);
  const pillWidth = paddingX + logoSize + logoGap + textWidth + paddingX;
  const pillHeight = fontSize * 0.35 + paddingY * 2;
  const pillX = slotX + (CARD_WIDTH_MM - pillWidth) / 2;
  const pillY = slotY + topOffset;

  doc.setFillColor(0, 0, 0);
  doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 1.5, 1.5, "F");

  try {
    const logoDataUrl = await loadLogoDataUrl();
    const logoY = pillY + (pillHeight - logoSize) / 2;
    doc.addImage(logoDataUrl, "PNG", pillX + paddingX, logoY, logoSize, logoSize);
  } catch {
    // Skip logo if it fails to load
  }

  const textX = pillX + paddingX + logoSize + logoGap + textWidth / 2;
  doc.setTextColor(255, 255, 255);
  doc.text(label, textX, pillY + pillHeight / 2, {
    align: "center",
    baseline: "middle",
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
 * Draws a fallback text rectangle when rendering fails.
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
 * Assembles the PDF from pre-rendered card images (from either image loading or html2canvas).
 * @returns void — triggers browser download.
 */
export async function assembleProxyPdf(
  proxyCards: ProxyCard[],
  renderedCards: Map<string, RenderedCard>,
  options: ProxyOptions,
): Promise<void> {
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
      const rendered = renderedCards.get(proxyRenderKey(proxyCard));

      if (rendered) {
        doc.addImage(rendered.dataUrl, "PNG", slotX, slotY, CARD_WIDTH_MM, CARD_HEIGHT_MM);
      } else {
        drawFallbackCard(doc, proxyCard.name, slotX, slotY);
      }

      if (options.watermark) {
        await drawWatermark(doc, slotX, slotY);
      }
    }
  }

  const slug = (options.deckName ?? "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  const filename = slug ? `${slug}-proxies.pdf` : "proxies.pdf";
  doc.save(filename);
}
