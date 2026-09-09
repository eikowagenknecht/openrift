import type { ImageQuad } from "@openrift/shared/contracts/admin/card-images";
import type { OpenCvLike } from "@openrift/shared/scan/detect-cv";
import { detectCardsWithCv } from "@openrift/shared/scan/detect-cv";
import { toGray } from "@openrift/shared/scan/image";

import { bestCandidateQuad, clampQuad, scaleQuad } from "@/features/admin/lib/straighten-quad";

const MAX_WORKING_SIDE = 1600;

/** Decoded with `imageOrientation: "none"` so the corners land on the pixel grid the server reports. */
export async function detectQuadInOriginal(cv: OpenCvLike, url: string): Promise<ImageQuad | null> {
  const response = await fetch(url);
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: "none" });
  const fullWidth = bitmap.width;
  const fullHeight = bitmap.height;
  const scale = Math.min(1, MAX_WORKING_SIDE / Math.max(fullWidth, fullHeight));
  const width = Math.max(1, Math.round(fullWidth * scale));
  const height = Math.max(1, Math.round(fullHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const gray = toGray(context.getImageData(0, 0, width, height));
  const found = bestCandidateQuad(detectCardsWithCv(cv, gray));
  if (found === null) {
    return null;
  }
  return clampQuad(scaleQuad(found, fullWidth / width), fullWidth, fullHeight);
}
