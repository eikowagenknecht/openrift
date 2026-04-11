/**
 * Returns true when a landscape card image needs a -90deg CSS rotation
 * to display in portrait orientation.
 * @returns Whether the image needs a -90deg CSS rotation for display
 */
export function needsCssRotation(orientation: string): boolean {
  return orientation === "landscape";
}

/**
 * Style for a wrapper div that rotates a landscape image to display as portrait.
 * The wrapper is sized to landscape dimensions (width = container height,
 * height = container width via aspect-ratio), centered, then rotated -90deg
 * so it fills the portrait container exactly. The img inside uses
 * `size-full object-cover`.
 */
export const LANDSCAPE_ROTATION_STYLE: React.CSSProperties = {
  width: "139.65%",
  aspectRatio: "88 / 63",
  transform: "translate(-50%, -50%) rotate(-90deg)",
};
