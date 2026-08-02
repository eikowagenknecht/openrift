/**
 * The reference renders feature verification matches a camera frame against.
 *
 * One implementation for both sides of the scanner: the page decodes into a
 * `<canvas>`, the worker into an `OffscreenCanvas`, and everything else about
 * the decode — the grey flatten, what counts as missing, what counts as
 * transient — is identical and has to stay that way. It did not: the worker
 * carried its own copy, whose own docstring said so.
 */

import { imageUrl } from "@openrift/shared";
import type { RgbaImage } from "@openrift/shared/scan";

/** The slice of a 2D context the decode uses, shared by both canvas kinds. */
interface ReferenceContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect: (x: number, y: number, width: number, height: number) => void;
  drawImage: (image: ImageBitmap, x: number, y: number) => void;
  getImageData: (x: number, y: number, width: number, height: number) => ImageData;
}

/** The slice of a canvas the decode uses, shared by both canvas kinds. */
interface ReferenceCanvas {
  width: number;
  height: number;
  getContext: (
    id: "2d",
    options: { willReadFrequently: boolean },
  ) => ReferenceContext | null | undefined;
}

// Reused across reference fetches; a new canvas per card would churn memory.
let referenceCanvas: ReferenceCanvas | null = null;

/**
 * The reusable decode canvas, of whichever kind this thread has.
 *
 * @returns The canvas, created on first use.
 */
function decodeCanvas(): ReferenceCanvas {
  if (!referenceCanvas) {
    referenceCanvas =
      typeof document === "undefined"
        ? new OffscreenCanvas(1, 1)
        : document.createElement("canvas");
  }
  return referenceCanvas;
}

/**
 * Fetch a reference render for feature verification.
 *
 * Transparent rounded corners are flattened onto mid grey, matching how the
 * bank references were decoded in the bench; a hard white or black corner
 * would inject an edge no photograph shows.
 *
 * Throws on transient failures (network errors, server errors): the session
 * caches null as "definitively missing" for its whole lifetime, and a cached
 * transient miss would silently remove the rival that refuses a wrong winner,
 * on every frame until restart.
 *
 * @returns The decoded render, or null when the render does not exist.
 */
export async function fetchReference(key: string): Promise<RgbaImage | null> {
  const response = await fetch(imageUrl(key, "400w"));
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`reference fetch failed with status ${response.status}`);
  }
  const blob = await response.blob();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    // An undecodable asset will not improve on retry.
    return null;
  }
  const canvas = decodeCanvas();
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return null;
  }
  context.fillStyle = "rgb(128, 128, 128)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: data.data, width: canvas.width, height: canvas.height };
}
