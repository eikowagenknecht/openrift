import { qrPngDataUri } from "@openrift/shared/qr";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import type { Io } from "../../../io.js";
import { CARD_MEDIA_DIR } from "../../catalog/services/images/paths.js";

/**
 * satori speaks a CSS subset: every container with more than one child needs
 * an explicit `display: "flex"`, the default flex direction is `row`, and
 * colors must be concrete (no oklch). Raster sources (WebP card art, SVG
 * glyphs) cannot be embedded by satori directly, so each is transcoded to a
 * PNG data URI with sharp first.
 */

// Concrete approximations of the site's dark theme (apps/web/src/index.css).
export const COLORS = {
  background: "#14161d",
  surface: "#21242b",
  surfaceBorder: "#2d313a",
  text: "#f2f2f2",
  muted: "#9aa0ab",
  gold: "#cdac6e",
} as const;

export const CARD_ASPECT = 0.715;

export const TILE_BORDER = 1;

export const QR_SIZE = 84;

const QR_RADIUS = 6;

const CARD_ART_VARIANT = "full";

export const CARD_RADIUS_FRACTION = 0.05;

export function cardRadiusPx(tileW: number, tileH: number): number {
  return Math.round(Math.min(tileW, tileH) * CARD_RADIUS_FRACTION);
}

export interface Element {
  type: string;
  props: Record<string, unknown>;
}
export type Child = Element | string | false | null | undefined;

export function element(
  type: string,
  style: Record<string, unknown>,
  ...children: Child[]
): Element {
  const kept = children.filter(
    (child): child is Element | string => child !== false && child !== null && child !== undefined,
  );
  const childProp = kept.length === 0 ? undefined : kept.length === 1 ? kept[0] : kept;
  return { type, props: { style, children: childProp } };
}

interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700;
  style: "normal";
}

let cachedFonts: SatoriFont[] | null = null;

/** satori cannot read the WOFF2 the web app uses, so these TTFs are static instances of the same variable face. */
async function loadFonts(io: Io): Promise<SatoriFont[]> {
  if (cachedFonts) {
    return cachedFonts;
  }
  const fontDir = `${import.meta.dirname}/../../../assets/fonts`;
  const read = (file: string): Promise<Buffer> => io.fs.readFile(`${fontDir}/${file}`);
  cachedFonts = [
    {
      name: "Hanken Grotesk",
      data: await read("HankenGrotesk-Regular.ttf"),
      weight: 400,
      style: "normal",
    },
    {
      name: "Hanken Grotesk",
      data: await read("HankenGrotesk-SemiBold.ttf"),
      weight: 600,
      style: "normal",
    },
    {
      name: "Hanken Grotesk",
      data: await read("HankenGrotesk-Bold.ttf"),
      weight: 700,
      style: "normal",
    },
  ];
  return cachedFonts;
}

async function cardArtDataUri(
  io: Io,
  imageId: string,
  widthPx: number,
  heightPx: number,
  radiusPx: number,
): Promise<string | null> {
  try {
    const path = `${CARD_MEDIA_DIR}/${imageId.slice(-2)}/${imageId}-${CARD_ART_VARIANT}.webp`;
    const source = await io.fs.readFile(path);
    // satori does not clip a child <img> to the parent's border-radius; round corners in sharp.
    const cornerMask = Buffer.from(
      `<svg width="${widthPx}" height="${heightPx}"><rect width="${widthPx}" height="${heightPx}" rx="${radiusPx}" ry="${radiusPx}" fill="#fff"/></svg>`,
    );
    const png = await io
      .sharp(source)
      .resize(widthPx, heightPx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .composite([{ input: cornerMask, blend: "dest-in" }])
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // Falls back to a name-only tile on read/decode failure.
    return null;
  }
}

/**
 * satori has no CSS `filter`; the blur is baked into the raster here.
 */
export async function blurredArtBackdropDataUri(
  io: Io,
  imageId: string,
  widthPx: number,
  heightPx: number,
): Promise<string | null> {
  try {
    const path = `${CARD_MEDIA_DIR}/${imageId.slice(-2)}/${imageId}-${CARD_ART_VARIANT}.webp`;
    const source = await io.fs.readFile(path);
    // Overscan 1.4x from the top, then extract a window 25% down, to stay off the card border.
    const overscanH = Math.round(heightPx * 1.4);
    const png = await io
      .sharp(source)
      .resize(widthPx, overscanH, { fit: "cover", position: "top" })
      .extract({ left: 0, top: Math.round(heightPx * 0.25), width: widthPx, height: heightPx })
      .blur(widthPx / 50)
      .modulate({ saturation: 1.25 })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** librsvg rasterizes at the intrinsic size; raise density to render natively at the target size. */
export async function svgToPngDataUri(
  io: Io,
  svg: Buffer,
  sizePx: number,
  intrinsicPx = 24,
): Promise<string | null> {
  try {
    const density = Math.max(72, Math.ceil((sizePx / intrinsicPx) * 72));
    const png = await io
      .sharp(svg, { density })
      .resize(sizePx, sizePx, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export function tileArtDataUri(
  io: Io,
  imageId: string | null,
  tileW: number,
  tileH: number,
  scale: number,
): Promise<string | null> {
  if (!imageId) {
    return Promise.resolve(null);
  }
  const contentW = tileW - 2 * TILE_BORDER;
  const contentH = tileH - 2 * TILE_BORDER;
  return cardArtDataUri(
    io,
    imageId,
    contentW * scale,
    contentH * scale,
    cardRadiusPx(contentW, contentH) * scale,
  );
}

export interface TileCard {
  cardName: string;
  quantity?: number;
}

/**
 * Every measurement here must stay a fraction of the tile, not a fixed px value.
 */
export function cardTile(
  card: TileCard,
  dataUri: string | null,
  tileW: number,
  tileH: number,
): Element {
  const contentW = tileW - 2 * TILE_BORDER;
  const contentH = tileH - 2 * TILE_BORDER;
  const image: Element = dataUri
    ? { type: "img", props: { src: dataUri, width: contentW, height: contentH } }
    : element(
        "div",
        {
          display: "flex",
          width: contentW,
          height: contentH,
          alignItems: "center",
          justifyContent: "center",
          padding: Math.max(3, Math.round(tileW * 0.05)),
          textAlign: "center",
          fontSize: Math.max(7, Math.round(tileW * 0.16)),
          fontWeight: 600,
          color: COLORS.muted,
          lineHeight: 1.2,
        },
        card.cardName,
      );

  const quantity = card.quantity ?? 1;
  const badgeH = Math.min(40, Math.max(20, Math.round(tileH * 0.18)));
  const inset = Math.max(5, Math.round(tileH * 0.03));
  const badge =
    quantity > 1 &&
    element(
      "div",
      {
        display: "flex",
        position: "absolute",
        bottom: inset,
        right: inset,
        alignItems: "center",
        justifyContent: "center",
        height: badgeH,
        minWidth: badgeH,
        paddingLeft: Math.round(badgeH * 0.18),
        paddingRight: Math.round(badgeH * 0.18),
        borderRadius: Math.round(badgeH * 0.28),
        backgroundColor: "rgba(8,9,12,0.82)",
        color: COLORS.text,
        fontSize: Math.round(badgeH * 0.62),
        fontWeight: 700,
      },
      `×${quantity}`,
    );

  return element(
    "div",
    {
      display: "flex",
      position: "relative",
      width: tileW,
      height: tileH,
      borderRadius: cardRadiusPx(tileW, tileH),
      overflow: "hidden",
      backgroundColor: COLORS.surface,
      border: `${TILE_BORDER}px solid ${COLORS.surfaceBorder}`,
    },
    image,
    badge,
  );
}

/**
 * satori: an overflow-clipped node's flex baseline is its box bottom, not
 * the text baseline. Elide the string instead.
 */
export function elideTitle(title: string, max: number): string {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
}

const BASELINE_ERROR_SLOPE_LH1 = 0.14;

/**
 * satori bottom-aligns flex children; apply as `translateY` on the smaller
 * run, in a `flex-end` row, both runs at `lineHeight: 1`.
 */
export function baselineNudge(largerFontSize: number, smallerFontSize: number): number {
  const gap = largerFontSize - smallerFontSize;
  // A plain 0 here keeps `-0` out of the emitted `translateY(-0px)`.
  return gap <= 0 ? 0 : -Math.round(gap * BASELINE_ERROR_SLOPE_LH1);
}

/**
 * Dark-on-white: a light-on-dark code is inverted polarity, which older
 * scanners refuse. The white quiet zone doubles as the plate the code needs.
 */
export function qrDataUri(url: string, scale: number, size = QR_SIZE): Promise<string | null> {
  return qrPngDataUri(url, { width: size * scale }).catch(() => null);
}

/**
 * Keep `size` equal to the size the source was generated at: scaling down
 * resamples cleanly, but scaling up blurs the modules.
 */
export function qrMark(dataUri: string, size = QR_SIZE): Element {
  return {
    type: "img",
    props: {
      src: dataUri,
      width: size,
      height: size,
      style: { borderRadius: QR_RADIUS },
    },
  };
}

/**
 * satori emits vector text, so resvg needs no fonts. `zoom: scale` renders
 * the layout at N×.
 */
export async function renderTreeToPng(
  io: Io,
  root: Element,
  width: number,
  height: number,
  scale = 1,
): Promise<Buffer> {
  const fonts = await loadFonts(io);
  const svg = await satori(root as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts,
  });
  const rendered = new Resvg(svg, {
    fitTo: { mode: "zoom", value: scale },
    font: { loadSystemFonts: false },
  }).render();
  return Buffer.from(rendered.asPng());
}
