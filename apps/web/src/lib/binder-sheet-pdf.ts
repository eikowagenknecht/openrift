import { qrPngDataUri } from "@openrift/shared/qr";
import type { jsPDF } from "jspdf";

import type { BinderSheetPaper, BinderSheetSize, BinderSheetStyle } from "@/lib/binder-sheet-specs";
import { BINDER_SHEET_PAPERS, BINDER_SHEET_SPECS, CARD_WIDTH_MM } from "@/lib/binder-sheet-specs";
import { createPdfDocument } from "@/lib/pdf-document";
import { loadLogoDataUrl } from "@/lib/pdf-logo";

/**
 * Printable binder QR sheet: a share link as a QR code cut to real card or
 * binder-page dimensions. Printed at 1:1 mm, which only holds with the print
 * dialog set to "Actual size". Cut marks and the calibration ruler sit in the
 * trim area and are opt-in; the sheet's own frame doubles as the cut line.
 */

// Sizes and papers live in `binder-sheet-specs` so the dialog can label its
// controls without loading jsPDF, the QR encoder and the logo raster.
export type { BinderSheetPaper, BinderSheetSize } from "@/lib/binder-sheet-specs";
export { BINDER_SHEET_PAPERS, BINDER_SHEET_SPECS } from "@/lib/binder-sheet-specs";

export interface BinderSheetOptions {
  shareUrl: string;
  title: string;
  subtitle: string;
  contact?: string;
  showLink: boolean;
  cutMarks: boolean;
  ruler: boolean;
  size: BinderSheetSize;
  paper: BinderSheetPaper;
  style: BinderSheetStyle;
  filenameHint?: string;
}

/** pt → mm */
const PT_TO_MM = 0.352778;
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

export interface SheetLayout {
  pageWidth: number;
  pageHeight: number;
  sheetWidth: number;
  sheetHeight: number;
  cols: number;
  rows: number;
  marginX: number;
  marginY: number;
}

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
  vertical: boolean;
}

/** mm */
const RULER_LENGTH_MM = 50;
const RULER_BAND_MM = 9;

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
  pad: number;
  /** pt */
  title: number;
  subtitle: number;
  contact: number;
  link: number;
  footer: number;
  qrMax: number;
}

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

/** Needed because a long title still overflows at the smallest allowed font size. */
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

/** Rendered at 300 dpi, clamped so a card-size code stays legible and a binder-page code doesn't balloon the PDF. */
export function qrPixelWidth(sizeMm: number): number {
  return Math.min(2048, Math.max(512, Math.ceil((sizeMm / 25.4) * 300)));
}

export function binderSheetFilename(hint?: string): string {
  const slug = (hint ?? "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  return slug ? `openrift-binder-${slug}.pdf` : "openrift-binder-sheet.pdf";
}

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

function lineHeightMm(fontSize: number): number {
  return fontSize * PT_TO_MM * LINE_HEIGHT;
}

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

  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, width, height, "F");

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
    doc.setDrawColor(COLORS.frame[0], COLORS.frame[1], COLORS.frame[2]);
    doc.setLineWidth(0.2);
    const ruleY = y + headerHeight - metrics.pad * 0.3;
    doc.line(x + metrics.pad * 1.5, ruleY, x + width - metrics.pad * 1.5, ruleY);
  }

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

  // Draw the frame after the header band, or it renders under the band's edge.
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

async function buildQrDataUrl(shareUrl: string, sizeMm: number): Promise<string> {
  return await qrPngDataUri(shareUrl, { width: qrPixelWidth(sizeMm) });
}

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

export async function generateBinderSheetPdf(options: BinderSheetOptions): Promise<void> {
  const doc = await buildBinderSheetDoc(options);
  doc.save(binderSheetFilename(options.filenameHint));
}
