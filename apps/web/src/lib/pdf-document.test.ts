// oxlint-disable-next-line import/no-nodejs-modules -- test reads a real PNG fixture from public/
import { readFileSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- test reads a real PNG fixture from public/
import { join } from "node:path";

import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";

import { createPdfDocument } from "./pdf-document";

/**
 * A real PNG, because the bug this guards is in jsPDF's PNG path: it decodes the
 * source image and, with compression off, writes the raw pixels into the stream.
 * og-image.png is 1200 × 630 RGBA, so it costs 3 MB decoded and 77 KB on disk —
 * a wide enough gap that a regression is unmistakable.
 * @returns The fixture as a PNG data URL.
 */
function fixtureDataUrl(): string {
  const bytes = readFileSync(join(import.meta.dirname, "../../public/og-image.png"));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

/**
 * Decoded size of the fixture's colour data. The fixture is fully opaque, so
 * jsPDF drops the alpha SMask and only these RGB bytes reach the stream.
 */
const RAW_IMAGE_BYTES = 1200 * 630 * 3;

/**
 * Renders the fixture onto one page.
 * @returns The finished PDF's byte length.
 */
function pdfBytes(doc: jsPDF): number {
  doc.addImage(fixtureDataUrl(), "PNG", 10, 10, 100, 52.5);
  return (doc.output("arraybuffer") as ArrayBuffer).byteLength;
}

describe("createPdfDocument", () => {
  it("marks embedded images as FlateDecode", () => {
    const doc = createPdfDocument({ unit: "mm", format: "a4" });
    doc.addImage(fixtureDataUrl(), "PNG", 10, 10, 100, 52.5);
    expect(doc.output()).toContain("/FlateDecode");
  });

  it("compresses embedded images instead of storing raw pixels", () => {
    const size = pdfBytes(createPdfDocument({ unit: "mm", format: "a4" }));
    expect(size).toBeLessThan(RAW_IMAGE_BYTES / 4);
  });

  it("stays far below the raw jsPDF default, which stores the pixels uncompressed", () => {
    // The control: a plain document is what shipped the 6.5 MB binder sheet. If
    // jsPDF ever starts compressing by default this assertion fails, and the
    // wrapper can go.
    const uncompressed = pdfBytes(new jsPDF({ unit: "mm", format: "a4" }));
    expect(uncompressed).toBeGreaterThan(RAW_IMAGE_BYTES * 0.9);

    const compressed = pdfBytes(createPdfDocument({ unit: "mm", format: "a4" }));
    expect(compressed).toBeLessThan(uncompressed / 10);
  });
});
