import QRCode from "qrcode";

/**
 * The house QR settings and the two ways the app draws a code: an inline SVG
 * from the raw module matrix (on screen) and a PNG data URI (satori share
 * images, the printable binder sheet).
 *
 * Every surface goes through here rather than calling an encoder directly.
 * The settings below have defaults that are wrong for this app, and both are
 * invisible when they go wrong — the code simply fails to scan on some phones,
 * which nobody notices in review.
 */

/**
 * Error-correction level for every QR the app produces. `M` recovers from ~15%
 * damage against `L`'s ~7%, which is the margin a phone screen read at an angle
 * across a table, or a printed sheet with a thumb over one corner, actually
 * needs.
 */
export const QR_ERROR_CORRECTION = "M";

/**
 * Quiet-zone modules around the symbol. Scanners need this clear band, and the
 * app's tight layouts (a code on a plate, a code in a grid tile) supply nothing
 * on their own. Renderers apply it themselves — {@link qrMatrix} returns the
 * bare symbol so the caller can size the viewport around it.
 */
export const QR_MARGIN = 2;

/** Module colour. Dark-on-white: inverted polarity is refused by cheap scanners. */
export const QR_DARK = "#000000";

/** Quiet-zone and background colour, which doubles as the light plate a code needs. */
export const QR_LIGHT = "#ffffff";

/**
 * The raw module bit-matrix for `value`, row-major, `true` for a dark module.
 * Synchronous, and with no quiet zone baked in — apply {@link QR_MARGIN}
 * around it when drawing.
 * @returns A square matrix, at least 21×21 (QR version 1).
 */
export function qrMatrix(value: string): boolean[][] {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: QR_ERROR_CORRECTION });
  const { size, data } = modules;
  const rows: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const cells: boolean[] = [];
    for (let col = 0; col < size; col += 1) {
      cells.push(data[row * size + col] === 1);
    }
    rows.push(cells);
  }
  return rows;
}

interface QrPngOptions {
  /** Bitmap edge length in pixels, quiet zone included. */
  width: number;
}

/**
 * A PNG data URI of the code at the house settings, for the renderers that
 * cannot take an SVG (satori's `img`, jsPDF's `addImage`). Generate it at the
 * resolution it will be drawn at: scaling down resamples cleanly, scaling up
 * blurs the modules.
 * @returns The `data:image/png;base64,…` URI.
 */
export function qrPngDataUri(value: string, options: QrPngOptions): Promise<string> {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: QR_MARGIN,
    width: options.width,
    color: { dark: QR_DARK, light: QR_LIGHT },
  });
}
