import type { TimeRange } from "@openrift/shared/types/pricing";

export const TIME_RANGES = [
  { value: "7d", label: "7D", days: 7 },
  { value: "30d", label: "30D", days: 30 },
  { value: "90d", label: "90D", days: 90 },
  { value: "all", label: "All", days: 0 },
] as const satisfies readonly { value: TimeRange; label: string; days: number }[];
