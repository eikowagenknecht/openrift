import { createPdfDocument } from "@/lib/pdf-document";

const A4_SHORT_MM = 210;
const A4_LONG_MM = 297;
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

async function blobToDataUrl(blob: Blob): Promise<string> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping callback-based FileReader API
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Read failed")));
    reader.readAsDataURL(blob);
  });
}

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

export async function downloadImageAsPdf(blob: Blob, filename: string): Promise<void> {
  const dataUrl = await blobToDataUrl(blob);
  const { width, height } = await imageSize(dataUrl);
  const placement = fitImageOnPage(width, height);
  const doc = createPdfDocument({ orientation: placement.orientation, unit: "mm", format: "a4" });
  doc.addImage(dataUrl, "PNG", placement.x, placement.y, placement.width, placement.height);
  doc.save(filename);
}
