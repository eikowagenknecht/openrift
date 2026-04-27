import type { TimeRange } from "@openrift/shared";

export const TIME_RANGES: { value: TimeRange; label: string; days: number }[] = [
  { value: "7d", label: "7D", days: 7 },
  { value: "30d", label: "30D", days: 30 },
  { value: "90d", label: "90D", days: 90 },
  { value: "all", label: "All", days: 0 },
];
