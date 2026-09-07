/**
 * Pick by slot CSS width × DPR: `120w` covers up to ~60px at DPR 2, `240w` up
 * to ~120px, `400w` up to ~200px; `full` is the 800w hero size.
 */
export type ImageVariant = "120w" | "240w" | "400w" | "full";

/** Directory prefix is the UUID's last 2 hex chars, matching the rehoster's on-disk layout. */
export function imageUrl(imageId: string, variant: ImageVariant): string {
  return `/media/cards/${imageId.slice(-2)}/${imageId}-${variant}.webp`;
}
