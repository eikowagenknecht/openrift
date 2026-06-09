import { NONE } from "@openrift/shared";

/**
 * Human-readable label for an active numeric range filter, accounting for the
 * NONE sentinel (cards with no value) and open-ended bounds. `min`/`max` are
 * the chosen bounds (null = open on that side); `availableMin`/`availableMax`
 * are the full range used to resolve an open bound.
 * @returns A display label such as "3", "1–5", "≤5", "≥3", or "None".
 */
export function rangeBadgeLabel(
  min: number | null,
  max: number | null,
  availableMin: number,
  availableMax: number,
  formatValue: (value: number) => string = String,
): string {
  const resolvedMin = min ?? availableMin;
  const resolvedMax = max ?? availableMax;
  const fmtNone = (value: number) => (value === NONE ? "None" : formatValue(value));

  if (resolvedMin === NONE && resolvedMax === NONE) {
    return "None";
  }
  if (resolvedMin === NONE) {
    return max === null ? "≥None" : `None–${formatValue(resolvedMax)}`;
  }
  if (resolvedMin === resolvedMax) {
    return formatValue(resolvedMin);
  }
  if (min !== null && max !== null) {
    return `${fmtNone(resolvedMin)}–${fmtNone(resolvedMax)}`;
  }
  if (min === null) {
    return `≤${fmtNone(resolvedMax)}`;
  }
  return `≥${fmtNone(resolvedMin)}`;
}
