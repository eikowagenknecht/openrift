import { qrPngDataUri } from "@openrift/shared/qr";
import type { jsPDF } from "jspdf";

import { createPdfDocument } from "@/lib/pdf-document";
import { loadLogoDataUrl } from "@/lib/pdf-logo";

/**
 * Printable binder QR sheet: one share link as a QR code on a sheet cut to real
 * card or binder-page dimensions, so it can be slipped into a sleeve as the
 * front page of a trade binder.
 *
 * Everything is laid out in millimetres and printed at 1:1, which only holds if
 * the print dialog is set to "Actual size".
 *
 * The card size prints 9 identical copies per page, the same 3×3 grid the proxy
 * printer uses; the binder-page sizes print one centred sheet. Both are clean by
 * default so a page can go straight into a binder. Cut marks (grid lines for the
 * 9-up, corner ticks for a single sheet) and a 50 mm calibration ruler are
 * opt-in; both sit in the trim area, so they are discarded when the sheet is cut
 * out. The sheet's own thin frame is always drawn and doubles as the cut line.
 */

export type BinderSheetSize = "card" | "2x2" | "3x3";
export type BinderSheetPaper = "a4" | "letter";
export type BinderSheetStyle = "light" | "dark";

export interface BinderSheetSpec {
  /** Control label, e.g. "3×3 binder page". */
  label: string;
  /** Physical size plus copies per page, e.g. "189 × 264 mm, 1 per page". */
  hint: string;
  /** Sheet width in mm (cards across × card width). */
  width: number;
  /** Sheet height in mm (cards down × card height). */
  height: number;
  /** Copies printed per page. */
  cols: number;
  rows: number;
}

/** Standard card dimensions in mm, matching the proxy printer. */
const CARD_WIDTH_MM = 63;
const CARD_HEIGHT_MM = 88;

export const BINDER_SHEET_SPECS: Record<BinderSheetSize, BinderSheetSpec> = {
  card: {
    label: "Card size",
    hint: "63 × 88 mm, 9 per page",
    width: CARD_WIDTH_MM,
    height: CARD_HEIGHT_MM,
    cols: 3,
    rows: 3,
  },
  "2x2": {
    label: "2×2 binder page",
    hint: "126 × 176 mm, 1 per page",
    width: 2 * CARD_WIDTH_MM,
    height: 2 * CARD_HEIGHT_MM,
    cols: 1,
    rows: 1,
  },
  "3x3": {
    label: "3×3 binder page",
    hint: "189 × 264 mm, 1 per page",
    width: 3 * CARD_WIDTH_MM,
    height: 3 * CARD_HEIGHT_MM,
    cols: 1,
    rows: 1,
  },
};

export const BINDER_SHEET_PAPERS: Record<
  BinderSheetPaper,
  { label: string; width: number; height: number }
> = {
  a4: { label: "A4", width: 210, height: 297 },
  letter: { label: "US Letter", width: 215.9, height: 279.4 },
};

export interface BinderSheetOptions {
  /** The share link the QR code encodes. */
  shareUrl: string;
  title: string;
  subtitle: string;
  /** Optional extra line, e.g. a Discord handle. */
  contact?: string;
  /** Prints the share URL as small text under the QR, for people who can't scan. */
  showLink: boolean;
  /** Cut lines between the 9-up copies, or crop marks around a single sheet. */
  cutMarks: boolean;
  /** 50 mm calibration bar in the paper margin, to verify the print scale. */
  ruler: boolean;
  size: BinderSheetSize;
  paper: BinderSheetPaper;
  style: BinderSheetStyle;
  /** Base name for the downloaded file; slugified, falls back to "binder". */
  filenameHint?: string;
}

/** Point → millimetre, for turning jsPDF font sizes into layout heights. */
const PT_TO_MM = 0.352778;
/** Line box as a multiple of the font size. */
const LINE_HEIGHT = 1.2;

const COLORS = {
  ink: [17, 24, 39],
  muted: [75, 85, 99],
  faint: [107, 114, 128],
  frame: [209, 213, 219],
  cutLine: [200, 200, 200],
  band: [7, 13, 24],
  onBand: [255, 255, 255],
  onBandMuted: [203, 213, 225],
} as const;

// ── Geometry ───────────────────────────────────────────────────────────────

export interface SheetLayout {
  pageWidth: number;
  pageHeight: number;
  sheetWidth: number;
  sheetHeight: number;
  cols: number;
  rows: number;
  /** Left edge of the printed block; the right margin matches it. */
  marginX: number;
  /** Top edge of the printed block; the bottom margin matches it. */
  marginY: number;
}

/**
 * Centres the sheet block (one sheet, or the 3×3 grid of copies) on the page.
 * @returns The page and block geometry in mm.
 */
export function sheetLayout(size: BinderSheetSize, paper: BinderSheetPaper): SheetLayout {
  const spec = BINDER_SHEET_SPECS[size];
  const page = BINDER_SHEET_PAPERS[paper];
  return {
    pageWidth: page.width,
    pageHeight: page.height,
    sheetWidth: spec.width,
    sheetHeight: spec.height,
    cols: spec.cols,
    rows: spec.rows,
    marginX: (page.width - spec.cols * spec.width) / 2,
    marginY: (page.height - spec.rows * spec.height) / 2,
  };
}

export interface RulerPlacement {
  x: number;
  y: number;
  /** Vertical rulers run down the side margin when the bottom band is too thin. */
  vertical: boolean;
}

/** Length of the calibration bar in mm. */
const RULER_LENGTH_MM = 50;
/** Margin band needed to hold the bar plus its note without hitting the paper edge. */
const RULER_BAND_MM = 9;

/**
 * Places the calibration ruler in a paper margin, outside the cut area, so it
 * is thrown away with the trim. Prefers the bottom band, falls back to the left
 * band, and is skipped when neither has room (the sheet itself stays correct).
 * @returns The ruler origin, or null when no margin can hold it.
 */
export function rulerPlacement(layout: SheetLayout): RulerPlacement | null {
  if (layout.marginY >= RULER_BAND_MM) {
    return { x: layout.marginX, y: layout.pageHeight - layout.marginY / 2, vertical: false };
  }
  if (layout.marginX >= RULER_BAND_MM && layout.rows * layout.sheetHeight >= RULER_LENGTH_MM) {
    return { x: layout.marginX / 2, y: layout.marginY, vertical: true };
  }
  return null;
}

export interface SheetMetrics {
  /** Inner padding on all four edges. */
  pad: number;
  /** Font sizes in points. */
  title: number;
  subtitle: number;
  contact: number;
  link: number;
  footer: number;
  /** Largest QR edge the sheet will use; shrunk further if the text needs room. */
  qrMax: number;
}

/**
 * Scales the sheet furniture from the card size upward. Everything scales with
 * the sheet width except the QR, which is capped by the sheet height so the
 * title and footer keep their share of a binder page.
 * @returns Paddings and font sizes for one sheet.
 */
export function sheetMetrics(size: BinderSheetSize): SheetMetrics {
  const spec = BINDER_SHEET_SPECS[size];
  const scale = spec.width / CARD_WIDTH_MM;
  return {
    pad: 5 * scale,
    title: 12 * scale,
    subtitle: 8.5 * scale,
    contact: 7.5 * scale,
    link: 6 * scale,
    footer: 6.5 * scale,
    qrMax: Math.min(spec.width - 10 * scale, spec.height * 0.5, 120),
  };
}

export type MeasureText = (text: string, fontSize: number) => number;

/**
 * Shrinks a font size in 0.5 pt steps until the text fits the available width.
 * Takes a measure function rather than a jsPDF document so the search is
 * testable without a canvas.
 * @returns The largest size that fits, or minSize when nothing does.
 */
export function fitFontSize(
  measure: MeasureText,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
): number {
  let size = startSize;
  while (size > minSize && measure(text, size) > maxWidth) {
    size -= 0.5;
  }
  return Math.max(size, minSize);
}

/**
 * Trims text to the available width, ending with an ellipsis. Needed because a
 * long title still overflows at the smallest allowed font size, and centred
 * text that overflows bleeds past the cut line.
 * @returns The text as-is when it fits, otherwise a trimmed, ellipsised copy.
 */
export function truncateToWidth(
  measure: MeasureText,
  text: string,
  maxWidth: number,
  fontSize: number,
): string {
  if (measure(text, fontSize) <= maxWidth) {
    return text;
  }
  let end = text.length;
  while (end > 0 && measure(`${text.slice(0, end).trimEnd()}…`, fontSize) > maxWidth) {
    end -= 1;
  }
  return end > 0 ? `${text.slice(0, end).trimEnd()}…` : "";
}

/**
 * Pixel width for a QR rendered at 300 dpi, clamped so a card-size code stays
 * legible and a binder-page code does not balloon the PDF.
 * @returns The QR bitmap width in pixels.
 */
export function qrPixelWidth(sizeMm: number): number {
  return Math.min(2048, Math.max(512, Math.ceil((sizeMm / 25.4) * 300)));
}

/**
 * Slugifies the download name.
 * @returns A file name like "openrift-binder-trade-list.pdf".
 */
export function binderSheetFilename(hint?: string): string {
  const slug = (hint ?? "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  return slug ? `openrift-binder-${slug}.pdf` : "openrift-binder-sheet.pdf";
}

// ── Drawing ────────────────────────────────────────────────────────────────

/**
 * Draws one line of centred text, shrinking it to fit the sheet width.
 * @returns The y position below the line.
 */
function drawCenteredLine(
  doc: jsPDF,
  text: string,
  centerX: number,
  topY: number,
  maxWidth: number,
  fontSize: number,
  style: "bold" | "normal",
  color: readonly [number, number, number],
): number {
  doc.setFont("helvetica", style);
  const measure: MeasureText = (value, size) => {
    doc.setFontSize(size);
    return doc.getTextWidth(value);
  };
  const size = fitFontSize(measure, text, maxWidth, fontSize, Math.max(4, fontSize * 0.55));
  const shown = truncateToWidth(measure, text, maxWidth, size);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
  const lineHeight = size * PT_TO_MM * LINE_HEIGHT;
  doc.text(shown, centerX, topY + lineHeight * 0.75, { align: "center" });
  return topY + lineHeight;
}

/**
 * Height one text line occupies, without drawing it.
 * @returns The line box height in mm.
 */
function lineHeightMm(fontSize: number): number {
  return fontSize * PT_TO_MM * LINE_HEIGHT;
}

/**
 * Draws the footer credit: the logo mark beside "openrift.app", as one centred
 * lockup. Measured and placed by hand rather than centring two elements
 * separately, so the pair reads as a single mark.
 */
function drawFooterMark(
  doc: jsPDF,
  centerX: number,
  topY: number,
  height: number,
  fontSize: number,
  logoDataUrl: string | null,
  color: readonly [number, number, number],
): void {
  const host = "openrift.app";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  const markSize = logoDataUrl ? height : 0;
  const gap = markSize * 0.3;
  const totalWidth = markSize + gap + doc.getTextWidth(host);
  const startX = centerX - totalWidth / 2;

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", startX, topY, markSize, markSize);
    } catch {
      // Skip the mark if jsPDF rejects the raster; the host text still shows.
    }
  }
  doc.setTextColor(color[0], color[1], color[2]);
  doc.text(host, startX + markSize + gap, topY + height * 0.72);
}

interface SheetTextLine {
  text: string;
  size: number;
  style: "bold" | "normal";
  color: readonly [number, number, number];
}

/**
 * Draws a single binder sheet with its top-left corner at (x, y).
 */
function drawSheet(
  doc: jsPDF,
  x: number,
  y: number,
  options: BinderSheetOptions,
  assets: { qrDataUrl: string; logoDataUrl: string | null },
): void {
  const spec = BINDER_SHEET_SPECS[options.size];
  const metrics = sheetMetrics(options.size);
  const { width, height } = spec;
  const centerX = x + width / 2;
  const contentWidth = width - metrics.pad * 2;
  const dark = options.style === "dark";

  // ── Background and frame ────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, width, height, "F");

  // ── Header (the owner's name and instruction line) ──────────────────────
  // The sheet belongs to its owner, so the title leads; OpenRift is credited
  // once, small, in the footer.
  const allHeadings: SheetTextLine[] = [
    {
      text: options.title,
      size: metrics.title,
      style: "bold",
      color: dark ? COLORS.onBand : COLORS.ink,
    },
    {
      text: options.subtitle,
      size: metrics.subtitle,
      style: "normal",
      color: dark ? COLORS.onBandMuted : COLORS.muted,
    },
  ];
  const headings = allHeadings.filter((line) => line.text.trim().length > 0);

  const headingsHeight = headings.reduce((sum, line) => sum + lineHeightMm(line.size), 0);
  const headerHeight = headingsHeight > 0 ? metrics.pad + headingsHeight + metrics.pad * 0.6 : 0;
  if (dark && headerHeight > 0) {
    doc.setFillColor(COLORS.band[0], COLORS.band[1], COLORS.band[2]);
    doc.rect(x, y, width, headerHeight, "F");
  }
  let headingY = y + metrics.pad;
  for (const line of headings) {
    headingY = drawCenteredLine(
      doc,
      line.text,
      centerX,
      headingY,
      contentWidth,
      line.size,
      line.style,
      line.color,
    );
  }
  if (!dark && headerHeight > 0) {
    // The light sheet has no band, so a hairline separates the name from the code.
    doc.setDrawColor(COLORS.frame[0], COLORS.frame[1], COLORS.frame[2]);
    doc.setLineWidth(0.2);
    const ruleY = y + headerHeight - metrics.pad * 0.3;
    doc.line(x + metrics.pad * 1.5, ruleY, x + width - metrics.pad * 1.5, ruleY);
  }

  // ── Footer (OpenRift credit) ────────────────────────────────────────────
  const footerHeight = lineHeightMm(metrics.footer);
  const footerTop = y + height - metrics.pad - footerHeight;
  drawFooterMark(
    doc,
    centerX,
    footerTop,
    footerHeight,
    metrics.footer,
    assets.logoDataUrl,
    COLORS.faint,
  );

  // ── Body (QR plus the secondary lines), centred between the two ─────────
  const gap = metrics.pad * 0.7;
  const textLines: SheetTextLine[] = [];
  if (options.contact?.trim()) {
    textLines.push({
      text: options.contact.trim(),
      size: metrics.contact,
      style: "normal",
      color: COLORS.muted,
    });
  }
  if (options.showLink) {
    textLines.push({
      text: options.shareUrl.replace(/^https?:\/\//u, ""),
      size: metrics.link,
      style: "normal",
      color: COLORS.faint,
    });
  }

  const textHeight = textLines.reduce((sum, line) => sum + lineHeightMm(line.size), 0);
  const bodyTop = y + headerHeight;
  const bodyHeight = footerTop - bodyTop;
  const qrSize = Math.max(
    20,
    Math.min(metrics.qrMax, contentWidth, bodyHeight - textHeight - gap * 2),
  );
  const stackHeight = qrSize + gap + textHeight;
  let cursorY = bodyTop + Math.max(gap * 0.5, (bodyHeight - stackHeight) / 2);

  doc.addImage(assets.qrDataUrl, "PNG", centerX - qrSize / 2, cursorY, qrSize, qrSize);
  cursorY += qrSize + gap;

  for (const line of textLines) {
    cursorY = drawCenteredLine(
      doc,
      line.text,
      centerX,
      cursorY,
      contentWidth,
      line.size,
      line.style,
      line.color,
    );
  }

  // Frame last so it sits above the header band's edge.
  doc.setDrawColor(COLORS.frame[0], COLORS.frame[1], COLORS.frame[2]);
  doc.setLineWidth(0.3);
  doc.rect(x, y, width, height);
}

/** Full-page grid lines for the 9-up card page, matching the proxy printer. */
function drawCutLines(doc: jsPDF, layout: SheetLayout): void {
  doc.setDrawColor(COLORS.cutLine[0], COLORS.cutLine[1], COLORS.cutLine[2]);
  doc.setLineWidth(0.2);
  for (let col = 0; col <= layout.cols; col++) {
    const lineX = layout.marginX + col * layout.sheetWidth;
    doc.line(lineX, 0, lineX, layout.pageHeight);
  }
  for (let row = 0; row <= layout.rows; row++) {
    const lineY = layout.marginY + row * layout.sheetHeight;
    doc.line(0, lineY, layout.pageWidth, lineY);
  }
}

/** Corner ticks just outside a single sheet, so the trim line stays clean. */
function drawCropMarks(doc: jsPDF, layout: SheetLayout): void {
  const offset = 2;
  const length = 4;
  const left = layout.marginX;
  const right = layout.marginX + layout.sheetWidth;
  const top = layout.marginY;
  const bottom = layout.marginY + layout.sheetHeight;

  doc.setDrawColor(COLORS.cutLine[0], COLORS.cutLine[1], COLORS.cutLine[2]);
  doc.setLineWidth(0.2);
  for (const [markX, markY, dirX, dirY] of [
    [left, top, -1, -1],
    [right, top, 1, -1],
    [left, bottom, -1, 1],
    [right, bottom, 1, 1],
  ] as const) {
    doc.line(markX + dirX * offset, markY, markX + dirX * (offset + length), markY);
    doc.line(markX, markY + dirY * offset, markX, markY + dirY * (offset + length));
  }
}

const RULER_NOTE =
  "This bar is exactly 50 mm. If it isn't, reprint at 100% (Actual size), not Fit to page.";

/** Calibration bar plus its note, drawn in the discarded paper margin. */
function drawRuler(doc: jsPDF, placement: RulerPlacement): void {
  doc.setDrawColor(COLORS.faint[0], COLORS.faint[1], COLORS.faint[2]);
  doc.setLineWidth(0.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(COLORS.faint[0], COLORS.faint[1], COLORS.faint[2]);

  const { x, y, vertical } = placement;
  if (vertical) {
    doc.line(x, y, x, y + RULER_LENGTH_MM);
    for (let tick = 0; tick <= RULER_LENGTH_MM; tick += 10) {
      const size = tick % RULER_LENGTH_MM === 0 ? 2.5 : 1.5;
      doc.line(x, y + tick, x + size, y + tick);
    }
    doc.text(RULER_NOTE, x + 3, y + RULER_LENGTH_MM + 3, { angle: -90 });
    return;
  }

  doc.line(x, y, x + RULER_LENGTH_MM, y);
  for (let tick = 0; tick <= RULER_LENGTH_MM; tick += 10) {
    const size = tick % RULER_LENGTH_MM === 0 ? 2.5 : 1.5;
    doc.line(x + tick, y, x + tick, y - size);
  }
  doc.text(RULER_NOTE, x + RULER_LENGTH_MM + 3, y);
}

/**
 * Renders the QR for the share link at print resolution.
 * @returns A PNG data URL of the QR code.
 */
async function buildQrDataUrl(shareUrl: string, sizeMm: number): Promise<string> {
  return await qrPngDataUri(shareUrl, { width: qrPixelWidth(sizeMm) });
}

/**
 * Draws the binder sheet PDF without saving it.
 * @returns The finished jsPDF document.
 */
export async function buildBinderSheetDoc(options: BinderSheetOptions): Promise<jsPDF> {
  const layout = sheetLayout(options.size, options.paper);
  const metrics = sheetMetrics(options.size);
  const qrDataUrl = await buildQrDataUrl(options.shareUrl, metrics.qrMax);

  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await loadLogoDataUrl();
  } catch {
    // Skip the logo if it fails to load; the sheet is still usable.
  }

  const doc = createPdfDocument({
    orientation: "portrait",
    unit: "mm",
    format: options.paper === "a4" ? "a4" : "letter",
  });

  if (options.cutMarks) {
    if (layout.cols * layout.rows > 1) {
      drawCutLines(doc, layout);
    } else {
      drawCropMarks(doc, layout);
    }
  }

  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      drawSheet(
        doc,
        layout.marginX + col * layout.sheetWidth,
        layout.marginY + row * layout.sheetHeight,
        options,
        { qrDataUrl, logoDataUrl },
      );
    }
  }

  const ruler = options.ruler ? rulerPlacement(layout) : null;
  if (ruler) {
    drawRuler(doc, ruler);
  }

  return doc;
}

/**
 * Builds the binder sheet PDF and triggers the browser download.
 * @returns A promise that resolves once the download has been triggered.
 */
export async function generateBinderSheetPdf(options: BinderSheetOptions): Promise<void> {
  const doc = await buildBinderSheetDoc(options);
  doc.save(binderSheetFilename(options.filenameHint));
}
