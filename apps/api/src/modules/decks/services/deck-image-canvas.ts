import { SHARE_IMAGE_CANVAS } from "@openrift/shared/share-image-params";

import type { Element } from "../../system/services/share-image-core.js";
import { COLORS, element, elideTitle } from "../../system/services/share-image-core.js";
import type { DeckImageInput } from "./deck-image-parts.js";

/**
 * `scale` picks resolution for one satori layout: 1x for the og:image
 * (1200x630), 2x for the download, embedding raster sources at that resolution.
 * Landscape and vertical are separate compositions, not one resized layout.
 * Vertical is download-only; no crawler consumes a 9:16 og:image.
 */

/** Per-canvas geometry. Everything that differs between the two compositions lives here, not branched on at each use. */
export interface DeckCanvas {
  width: number;
  height: number;
  pad: number;
  /** Reserved height for the title area (one row landscape, two lines vertical). */
  titleH: number;
  titleSize: number;
  bylineSize: number;
  metaSize: number;
  /**
   * Size of the QR at the right end of the title area. It sits there rather
   * than in the footer because down there it was boxed in by whatever height
   * the bottom band happened to take, which left it at QR_SIZE — about 7% of
   * the landscape canvas width, and unscannable once a chat client renders the
   * unfurl at a few hundred pixels. The title area has the whole width, so the
   * mark can be bigger; the area grows to the mark's height and the footer
   * shrinks to the host label alone to pay some of that back. Vertical's is
   * bigger again: that canvas is read at arm's length on a phone, and its two
   * title lines already give the block most of the mark's height.
   */
  headerQr: number;
  /** Height the archive result line adds to the title area, gap included. */
  resultH: number;
  /** Longest result line kept before eliding. */
  resultMaxChars: number;
  /** Height the footer reserves once it is only the host label. */
  footerLabelH: number;
  /** Legend domain glyphs, shown beside the card count (no amounts). */
  domainIcon: number;
}

export const LANDSCAPE: DeckCanvas = {
  ...SHARE_IMAGE_CANVAS.landscape,
  pad: 22,
  titleH: 46,
  titleSize: 34,
  bylineSize: 22,
  metaSize: 20,
  headerQr: 104,
  resultH: 30,
  resultMaxChars: 76,
  footerLabelH: 26,
  domainIcon: 30,
};

export const VERTICAL: DeckCanvas = {
  ...SHARE_IMAGE_CANVAS.vertical,
  pad: 28,
  // Title line, then the byline and metadata on a second line beneath it.
  titleH: 96,
  // Type steps up with the canvas: a story is read at arm's length on a phone,
  // where the landscape sizes would be a fraction of the frame's width.
  titleSize: 46,
  bylineSize: 28,
  metaSize: 26,
  headerQr: 132,
  resultH: 38,
  resultMaxChars: 58,
  footerLabelH: 32,
  domainIcon: 34,
};

export function titleTypeHeight(input: DeckImageInput, canvas: DeckCanvas): number {
  return canvas.titleH + (input.resultLine === undefined ? 0 : canvas.resultH);
}

export function resultLineElement(line: string, canvas: DeckCanvas, marginTop: number): Element {
  return element(
    "div",
    {
      display: "flex",
      fontSize: canvas.metaSize,
      lineHeight: 1,
      fontWeight: 600,
      color: COLORS.text,
      marginTop,
      whiteSpace: "nowrap",
    },
    elideTitle(line, canvas.resultMaxChars),
  );
}
