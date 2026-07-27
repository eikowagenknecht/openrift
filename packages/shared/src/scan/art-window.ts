/**
 * Where the artwork sits on a card, as fractions of the card size.
 *
 * Every card in the catalogue shares its frame, name bar and text box, so any
 * matcher that looks at those regions is comparing shared pixels. The windows
 * were measured from the reference renders: portrait cards carry art from just
 * below the top border to the type line at half height (full-art runes have art
 * everywhere, so the same window still lands on artwork), landscape
 * battlefields put an upside-down text strip above the art band and the type
 * chip below it. Both windows stay clear of the cost icons in the corners.
 */
export interface ArtWindow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const ART_PORTRAIT: ArtWindow = { x0: 0.07, y0: 0.05, x1: 0.93, y1: 0.5 };
export const ART_LANDSCAPE: ArtWindow = { x0: 0.04, y0: 0.2, x1: 0.96, y1: 0.58 };

/**
 * The art window for an image in its own orientation, in pixels.
 *
 * @returns The window rectangle.
 */
export function artWindowRect(
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const window = width >= height ? ART_LANDSCAPE : ART_PORTRAIT;
  const x = Math.round(width * window.x0);
  const y = Math.round(height * window.y0);
  return {
    x,
    y,
    width: Math.round(width * (window.x1 - window.x0)),
    height: Math.round(height * (window.y1 - window.y0)),
  };
}
