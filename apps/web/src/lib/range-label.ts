import { NONE } from "@openrift/shared/types/search";

/** Label for an active numeric range filter, handling the NONE sentinel and open-ended bounds. */
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
