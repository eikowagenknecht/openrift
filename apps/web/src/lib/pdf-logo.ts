/**
 * Shared OpenRift logo raster for the jsPDF documents (proxy sheets,
 * registration sheets, binder QR sheets). jsPDF cannot embed SVG, so the mark
 * is drawn into a canvas once per session and cached as a PNG data URL.
 */

const LOGO_RASTER_PX = 512;
/**
 * Give up on the logo rather than leave a PDF export spinning forever. An image
 * request that is blocked (offline, extension, or a non-loading environment)
 * fires neither `load` nor `error`, so the wait must be bounded. Callers treat a
 * rejection as "skip the logo".
 */
const LOGO_LOAD_TIMEOUT_MS = 3000;

let cachedLogoDataUrl: string | null = null;

/**
 * Loads the OpenRift logo as a PNG data URL for embedding in PDFs.
 * @returns A data URL string for the logo image.
 */
export async function loadLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) {
    return cachedLogoDataUrl;
  }

  // oxlint-disable-next-line promise/avoid-new -- wrapping callback-based Image loading API
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timer = globalThis.setTimeout(
      () => reject(new Error("Logo load timed out")),
      LOGO_LOAD_TIMEOUT_MS,
    );
    image.addEventListener("load", () => {
      globalThis.clearTimeout(timer);
      resolve(image);
    });
    image.addEventListener("error", () => {
      globalThis.clearTimeout(timer);
      reject(new Error("Logo failed to load"));
    });
    image.src = "/logo-color.svg";
  });

  const canvas = document.createElement("canvas");
  canvas.width = LOGO_RASTER_PX;
  canvas.height = LOGO_RASTER_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas 2d context");
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  cachedLogoDataUrl = canvas.toDataURL("image/png");
  return cachedLogoDataUrl;
}
