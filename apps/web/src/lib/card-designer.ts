/**
 * Pure helpers for the card designer (ADR-023). No browser or React deps live
 * here so every function is unit-testable in isolation; the html2canvas export
 * and clipboard plumbing live in `card-export.ts`.
 */

/** Suffix appended to the artist line so every exported card carries its origin. */
const ATTRIBUTION = "openrift.app";

/** Zoom bounds for the background image. 1 = exactly covers the card. */
export const CARD_MIN_ZOOM = 1;
export const CARD_MAX_ZOOM = 4;

/** Standard playing-card aspect (63×88mm), matching the `--aspect-card` CSS var. */
const CARD_ASPECT_W = 63;
const CARD_ASPECT_H = 88;

/** Card width / height. The card is portrait, so this is < 1. */
export const CARD_ASPECT = CARD_ASPECT_W / CARD_ASPECT_H;

/** Longest edge (px) an uploaded background is downscaled to before use. */
const MAX_IMAGE_EDGE = 2000;

export interface BackgroundTransform {
  /** Zoom factor; >= 1 (1 = exactly covers the card). */
  scale: number;
  /** Horizontal pan as a fraction of the card width (0 = centered). */
  offsetX: number;
  /** Vertical pan as a fraction of the card height (0 = centered). */
  offsetY: number;
}

/** How far the cover-fit image overflows the card per axis, before zoom. */
export interface CoverScale {
  /** Rendered width / card width when the image covers the card (>= 1). */
  coverW: number;
  /** Rendered height / card height when the image covers the card (>= 1). */
  coverH: number;
}

export interface BackgroundLayout {
  widthPct: number;
  heightPct: number;
  leftPct: number;
  topPct: number;
}

/**
 * Builds the footer artist line. With `includeBrand` (the default) whatever the
 * user typed is followed by `openrift.app` (an empty field shows just the
 * brand). With the brand off, only the user's text is returned (empty if none).
 *
 * @returns The attribution string for the card's artist slot.
 */
export function buildAttribution(artist?: string, includeBrand = true): string {
  const trimmed = artist?.trim() ?? "";
  if (!includeBrand) {
    return trimmed;
  }
  return trimmed ? `${trimmed} · ${ATTRIBUTION}` : ATTRIBUTION;
}

/**
 * How much an image of the given aspect must overflow the card to cover it.
 * One axis is always 1 (the matching edge); the other is > 1 (the cropped
 * edge). With an unknown aspect both are 1 (a plain centered cover).
 *
 * @returns The per-axis cover overflow factors.
 */
export function coverScale(aspect?: number | null): CoverScale {
  if (!aspect || aspect <= 0) {
    return { coverW: 1, coverH: 1 };
  }
  return {
    coverW: Math.max(1, aspect / CARD_ASPECT),
    coverH: Math.max(1, CARD_ASPECT / aspect),
  };
}

/**
 * Clamps a background transform so the zoom stays in range and the pan stays
 * within the real overflow for the image's aspect at that zoom. Unlike a
 * zoom-only clamp, this lets a cover-cropped image (e.g. a portrait photo) pan
 * into its hidden top/bottom even at zoom 1. Offsets are fractions of the card.
 *
 * @returns A new, clamped transform.
 */
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

/**
 * Computes the absolute size and position (as percentages of the card) for the
 * background image so it covers the card at the given zoom and pan. The pan is
 * clamped first, so the result never exposes an empty edge.
 *
 * @returns The image's width/height/left/top in card percentages.
 */
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

/**
 * Whether an uploaded file looks like an image we can render.
 *
 * @returns True for any `image/*` MIME type.
 */
export function isAcceptedImageType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Whether an image of these intrinsic dimensions should be downscaled.
 *
 * @returns True when the longest edge exceeds `maxEdge`.
 */
export function shouldDownscale(width: number, height: number, maxEdge = MAX_IMAGE_EDGE): boolean {
  return Math.max(width, height) > maxEdge;
}

/**
 * Scales dimensions down proportionally so the longest edge is at most
 * `maxEdge`. Returns the input unchanged when it already fits.
 *
 * @returns The (possibly reduced) integer dimensions.
 */
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
