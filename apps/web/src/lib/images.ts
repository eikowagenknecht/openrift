export function needsCssRotation(orientation: string): boolean {
  return orientation === "landscape";
}

/** Width is 88/63 (inverse of --aspect-card) so the -90deg rotation fills the portrait box. */
export const LANDSCAPE_ROTATION_STYLE: React.CSSProperties = {
  width: "calc(100% * 88 / 63)",
  aspectRatio: "88 / 63",
  transform: "translate(-50%, -50%) rotate(-90deg)",
};
