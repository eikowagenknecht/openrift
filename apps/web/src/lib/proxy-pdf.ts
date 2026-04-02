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

interface ProxyOptions {
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
 * Collects all stylesheet rules from the document into a single string.
 * Cached after first call since stylesheets don't change during generation.
 * @returns CSS text to inline in an SVG foreignObject.
 */
// Layout properties to inline (resolves cqw → px). Colors handled separately.
const LAYOUT_PROPS = [
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "font-size",
  "font-weight",
  "font-family",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-transform",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "gap",
  "row-gap",
  "column-gap",
  "display",
  "flex-direction",
  "flex-wrap",
  "flex",
  "flex-grow",
  "flex-shrink",
  "align-items",
  "justify-content",
  "border-radius",
  "border-width",
  "overflow",
  "opacity",
  "transform",
  "clip-path",
  "aspect-ratio",
  "text-align",
  "white-space",
  "vertical-align",
] as const;

// Color properties that html2canvas reads but can't parse when they're in oklch().
// We force-convert these to rgb/rgba via a canvas round-trip.
const COLOR_PROPS = ["color", "background-color", "border-color"] as const;

// Reusable 1x1 canvas for converting any CSS color string to rgba
let colorConversionCtx: CanvasRenderingContext2D | null = null;

/**
 * Converts any CSS color value (including oklch) to an rgba() string
 * by drawing it to a 1x1 canvas and reading the pixel back.
 * @returns rgba() or rgb() string.
 */
function toRgba(cssColor: string): string {
  if (!colorConversionCtx) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorConversionCtx = canvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = colorConversionCtx;
  if (!ctx) {
    return cssColor;
  }
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = ctx.getImageData(0, 0, 1, 1).data;
  if (alpha < 255) {
    return `rgba(${red}, ${green}, ${blue}, ${(alpha / 255).toFixed(3)})`;
  }
  return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * Recursively inlines computed styles on every element:
 * - Layout properties: inlined as-is (resolves cqw → px)
 * - Color properties: converted to rgb/rgba (html2canvas can't parse oklch)
 * Skips properties already set as inline styles (preserves React's hex gradients).
 */
function inlineComputedStyles(element: Element): void {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  const computed = getComputedStyle(element);

  // Inline layout props (skip if already set inline)
  for (const prop of LAYOUT_PROPS) {
    if (element.style.getPropertyValue(prop)) {
      continue;
    }
    const value = computed.getPropertyValue(prop);
    if (value) {
      element.style.setProperty(prop, value);
    }
  }

  // Force-convert color props to rgb (even if already inline, to catch oklch in Tailwind classes)
  for (const prop of COLOR_PROPS) {
    // If set inline with a hex/rgb value (e.g. from React), keep it
    const inlineVal = element.style.getPropertyValue(prop);
    if (inlineVal && !inlineVal.includes("oklch") && !inlineVal.includes("lab")) {
      continue;
    }
    const value = computed.getPropertyValue(prop);
    if (value && value !== "transparent" && value !== "rgba(0, 0, 0, 0)") {
      element.style.setProperty(prop, toRgba(value));
    }
  }

  // Also handle background (shorthand) and background-image for gradients set via inline style.
  // If the inline background uses hex (from getDomainGradientStyle), leave it alone.
  // If it's from a Tailwind class and computed as oklch, convert.
  const bgInline = element.style.getPropertyValue("background");
  if (!bgInline) {
    const bgComputed = computed.getPropertyValue("background-color");
    if (bgComputed && bgComputed !== "transparent" && bgComputed !== "rgba(0, 0, 0, 0)") {
      element.style.setProperty("background-color", toRgba(bgComputed));
    }
  }

  for (const child of element.children) {
    inlineComputedStyles(child);
  }
}

/**
 * Renders a CardPlaceholderImage (light variant) to a PNG data URL.
 * Renders the React component into the real DOM, serializes to an SVG foreignObject
 * with inlined styles so container queries and Tailwind classes work, then draws
 * the SVG to a canvas.
 * @returns Rendered card with data URL (never rotated — placeholders are always portrait).
 */
async function renderPlaceholderToDataUrl(proxyCard: ProxyCard): Promise<RenderedCard> {
  // Render React component into a real DOM element so container queries work
  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: ${RENDER_WIDTH_PX}px;
    pointer-events: none;
    z-index: -9999;
    opacity: 0;
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
    // Wait for React to commit and browser to compute styles (including container queries)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  // Make visible so we can inspect and measure
  container.style.opacity = "1";

  // Get the rendered card element
  const cardElement = container.firstElementChild as HTMLElement;
  if (!cardElement) {
    root.unmount();
    container.remove();
    throw new Error("CardPlaceholderImage did not render");
  }

  // Make visible so getComputedStyle and html2canvas work correctly
  container.style.opacity = "1";

  const cardWidth = cardElement.offsetWidth;
  const cardHeight = cardElement.offsetHeight;

  // Bake all computed styles (including resolved cqw → px) as inline styles.
  // html2canvas re-parses CSS from stylesheets and can't resolve cqw units,
  // but inline styles take priority and are already in px.
  inlineComputedStyles(cardElement);

  // Rasterize with html2canvas — it handles images, backgrounds, borders etc.
  const canvas = await html2canvas(cardElement, {
    width: cardWidth,
    height: cardHeight,
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
 * Loads the OpenRift logo as a PNG data URL for embedding in the PDF.
 * Cached after first call.
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
 * Always horizontal — overlays the card image regardless of orientation.
 */
async function drawWatermark(doc: jsPDF, slotX: number, slotY: number): Promise<void> {
  const label = "PROXY";
  const fontSize = 7;
  const paddingX = 2.5;
  const paddingY = 1.2;
  const topOffset = 2.5;
  const logoSize = fontSize * 0.35 + paddingY; // Match pill inner height roughly
  const logoGap = 1;

  doc.setFontSize(fontSize);
  const textWidth = doc.getTextWidth(label);
  const pillWidth = paddingX + logoSize + logoGap + textWidth + paddingX;
  const pillHeight = fontSize * 0.35 + paddingY * 2;
  const pillX = slotX + (CARD_WIDTH_MM - pillWidth) / 2;
  const pillY = slotY + topOffset;

  // Pill background
  doc.setFillColor(0, 0, 0);
  doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 1.5, 1.5, "F");

  // Logo
  try {
    const logoDataUrl = await loadLogoDataUrl();
    const logoY = pillY + (pillHeight - logoSize) / 2;
    doc.addImage(logoDataUrl, "PNG", pillX + paddingX, logoY, logoSize, logoSize);
  } catch {
    // Skip logo if it fails to load
  }

  // Label text (offset right to account for logo)
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
        await drawWatermark(doc, slotX, slotY);
      }
    }
  }

  doc.save("proxies.pdf");
}
