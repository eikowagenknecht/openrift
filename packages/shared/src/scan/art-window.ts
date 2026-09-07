/**
 * Where the artwork sits on a card, as fractions of the card size.
 *
 * Measured from reference renders; every card shares frame, name bar and text
 * box, so any matcher over these regions is comparing shared pixels too.
 */
export interface ArtWindow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const ART_PORTRAIT: ArtWindow = { x0: 0.07, y0: 0.05, x1: 0.93, y1: 0.5 };
export const ART_LANDSCAPE: ArtWindow = { x0: 0.04, y0: 0.2, x1: 0.96, y1: 0.58 };

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
