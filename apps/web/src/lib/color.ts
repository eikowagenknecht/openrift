/**
 * Linearizes a single sRGB channel (0-255) for WCAG relative luminance.
 *
 * @returns The linearized value in [0, 1].
 */
function linearize(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.040_45 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

/**
 * Picks a readable foreground color for the given hex background
 * using WCAG 2.x relative luminance with sRGB linearization.
 *
 * @returns "#1a1a1a" for light backgrounds, "#ffffff" for dark ones.
 */
export function contrastText(hex: string): string {
  const r = linearize(parseInt(hex.slice(1, 3), 16));
  const g = linearize(parseInt(hex.slice(3, 5), 16));
  const b = linearize(parseInt(hex.slice(5, 7), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? "#1a1a1a" : "#ffffff";
}
