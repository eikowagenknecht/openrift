import type { TimeRange } from "@openrift/shared";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { percentChange } from "@/lib/price-trend";
import { cn } from "@/lib/utils";

const RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "all time",
};

/**
 * Bare up/down percentage. Use this where a tooltip would be unwelcome, e.g.
 * inside another interactive element; otherwise prefer `PriceTrend`.
 * @returns The badge, or null when the price did not move.
 */
function TrendBadge({ pctChange, className }: { pctChange: number; className?: string }) {
  if (pctChange === 0) {
    return null;
  }
  const isUp = pctChange > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium [&_svg]:size-3",
        isUp ? "text-success" : "text-destructive",
        className,
      )}
    >
      {isUp ? <TrendingUpIcon /> : <TrendingDownIcon />}
      {Math.abs(pctChange)}%
    </span>
  );
}

/**
 * How much a price series moved over the window it covers, with the window
 * spelled out in a tooltip.
 *
 * Takes the plotted values rather than fetching its own, so the figure always
 * matches the line it sits beside — see `percentChange`.
 *
 * @returns The trend badge, or null when the price did not move.
 */
export function PriceTrend({
  values,
  range,
  className,
}: {
  values: number[];
  range: TimeRange;
  className?: string;
}) {
  const pctChange = percentChange(values);
  if (pctChange === 0) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<TrendBadge pctChange={pctChange} className={className} />} />
      <TooltipContent>
        {pctChange > 0 ? "+" : ""}
        {pctChange}% over {RANGE_LABELS[range]}
      </TooltipContent>
    </Tooltip>
  );
}
