/**
 * Pure helpers for the card designer. No browser or React deps live here;
 * the html2canvas export and clipboard plumbing live in `card-export.ts`.
 */

const ATTRIBUTION = "openrift.app";

export const CARD_MIN_ZOOM = 1;
export const CARD_MAX_ZOOM = 4;

const CARD_ASPECT_W = 63;
const CARD_ASPECT_H = 88;

export const CARD_ASPECT = CARD_ASPECT_W / CARD_ASPECT_H;

/** px */
const MAX_IMAGE_EDGE = 2000;

export interface BackgroundTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface CoverScale {
  coverW: number;
  coverH: number;
}

export interface BackgroundLayout {
  widthPct: number;
  heightPct: number;
  leftPct: number;
  topPct: number;
}

export function buildAttribution(artist?: string, includeBrand = true): string {
  const trimmed = artist?.trim() ?? "";
  if (!includeBrand) {
    return trimmed;
  }
  return trimmed ? `${trimmed} · ${ATTRIBUTION}` : ATTRIBUTION;
}

export function coverScale(aspect?: number | null): CoverScale {
  if (!aspect || aspect <= 0) {
    return { coverW: 1, coverH: 1 };
  }
  return {
    coverW: Math.max(1, aspect / CARD_ASPECT),
    coverH: Math.max(1, CARD_ASPECT / aspect),
  };
}

// Clamps pan to the real cover overflow at the given zoom, so a cropped
// image (e.g. portrait photo) can pan into its hidden edges even at zoom 1.
export function clampImageTransform(
  transform: BackgroundTransform,
  aspect?: number | null,
): BackgroundTransform {
  const scale = Math.min(CARD_MAX_ZOOM, Math.max(CARD_MIN_ZOOM, transform.scale));
  const { coverW, coverH } = coverScale(aspect);
  const maxX = Math.max(0, (coverW * scale - 1) / 2);
  const maxY = Math.max(0, (coverH * scale - 1) / 2);
  const clamp = (value: number, max: number) => {
    const limited = Math.min(max, Math.max(-max, value));
    // Normalize -0 to 0 so consumers and equality checks see a clean zero.
    return limited === 0 ? 0 : limited;
  };
  return {
    scale,
    offsetX: clamp(transform.offsetX, maxX),
    offsetY: clamp(transform.offsetY, maxY),
  };
}

export function backgroundLayout(
  aspect: number | null,
  scale: number,
  offsetX: number,
  offsetY: number,
): BackgroundLayout {
  const clamped = clampImageTransform({ scale, offsetX, offsetY }, aspect);
  const { coverW, coverH } = coverScale(aspect);
  const renderedW = coverW * clamped.scale;
  const renderedH = coverH * clamped.scale;
  const leftFrac = (1 - renderedW) / 2 + clamped.offsetX;
  const topFrac = (1 - renderedH) / 2 + clamped.offsetY;
  return {
    widthPct: renderedW * 100,
    heightPct: renderedH * 100,
    leftPct: leftFrac * 100,
    topPct: topFrac * 100,
  };
}

export function isAcceptedImageType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function shouldDownscale(width: number, height: number, maxEdge = MAX_IMAGE_EDGE): boolean {
  return Math.max(width, height) > maxEdge;
}

export function scaledDimensions(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height };
  }
  const ratio = maxEdge / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}
