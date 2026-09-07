import QRCode from "qrcode";

/** `M` recovers from ~15% damage against `L`'s ~7%, needed for an angled phone read or a thumb over one corner of a print. */
export const QR_ERROR_CORRECTION = "M";

/** Renderers apply this themselves; {@link qrMatrix} returns the bare symbol. */
export const QR_MARGIN = 2;

/** Dark-on-white: inverted polarity is refused by cheap scanners. */
export const QR_DARK = "#000000";

export const QR_LIGHT = "#ffffff";

/** No quiet zone baked in; apply {@link QR_MARGIN} around it when drawing. */
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
  /** px, quiet zone included. */
  width: number;
}

/** Generate at the resolution it will be drawn at: scaling up blurs the modules. */
export function qrPngDataUri(value: string, options: QrPngOptions): Promise<string> {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: QR_MARGIN,
    width: options.width,
    color: { dark: QR_DARK, light: QR_LIGHT },
  });
}
