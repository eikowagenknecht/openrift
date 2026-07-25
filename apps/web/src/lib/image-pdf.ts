import { jsPDF } from "jspdf";

/**
 * Wraps an already-rendered share image (the server-rendered deck image, ADR-031)
 * in an A4 PDF so it can be printed without the browser's image-print quirks.
 * The image is centred at the largest scale that fits inside the margins, and
 * the page turns landscape when the image is wider than it is tall.
 */

/** A4 in mm; the deck image is the only consumer and prints on A4. */
const A4_SHORT_MM = 210;
const A4_LONG_MM = 297;
/** Printable margin, clear of the unprintable edge on typical home printers. */
const PAGE_MARGIN_MM = 8;

export interface ImagePlacement {
  orientation: "portrait" | "landscape";
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Fits an image onto an A4 page, preserving its aspect ratio.
 * @returns The page orientation and the centred image box, in mm.
 */
export function fitImageOnPage(
  imageWidth: number,
  imageHeight: number,
  margin: number = PAGE_MARGIN_MM,
): ImagePlacement {
  const landscape = imageWidth > imageHeight;
  const pageWidth = landscape ? A4_LONG_MM : A4_SHORT_MM;
  const pageHeight = landscape ? A4_SHORT_MM : A4_LONG_MM;
  const scale = Math.min(
    (pageWidth - margin * 2) / imageWidth,
    (pageHeight - margin * 2) / imageHeight,
  );
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    orientation: landscape ? "landscape" : "portrait",
    pageWidth,
    pageHeight,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Reads an image blob into a data URL.
 * @returns The data URL of the blob.
 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping callback-based FileReader API
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Read failed")));
    reader.readAsDataURL(blob);
  });
}

/**
 * Measures a data-URL image.
 * @returns The image's natural pixel dimensions.
 */
async function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping callback-based Image loading API
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = dataUrl;
  });
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * Places an image blob on a single A4 page and triggers the download.
 * @returns A promise that resolves once the download has been triggered.
 */
export async function downloadImageAsPdf(blob: Blob, filename: string): Promise<void> {
  const dataUrl = await blobToDataUrl(blob);
  const { width, height } = await imageSize(dataUrl);
  const placement = fitImageOnPage(width, height);
  const doc = new jsPDF({ orientation: placement.orientation, unit: "mm", format: "a4" });
  doc.addImage(dataUrl, "PNG", placement.x, placement.y, placement.width, placement.height);
  doc.save(filename);
}
