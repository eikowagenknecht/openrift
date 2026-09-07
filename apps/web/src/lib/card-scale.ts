export const MIN_CARD_SCALE = 0.4;
export const MAX_CARD_SCALE = 1;

export function clampCardScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return MAX_CARD_SCALE;
  }
  return Math.min(MAX_CARD_SCALE, Math.max(MIN_CARD_SCALE, scale));
}
