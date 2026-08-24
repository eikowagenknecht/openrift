/**
 * Keeps a value inside a closed range.
 *
 * @returns The value, bounded by `min` and `max`.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
