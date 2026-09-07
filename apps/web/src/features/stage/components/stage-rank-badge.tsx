import { TIER_LABEL_INK, tierRowColor } from "@openrift/shared/tier-colors";

import { cn } from "@/lib/utils";

export function StageRankBadge({
  label,
  rowIndex,
  unranked,
  className,
}: {
  label: string;
  rowIndex: number;
  unranked?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-heading rounded-lg px-4 py-2 text-center text-4xl font-bold wrap-anywhere",
        className,
      )}
      style={{ backgroundColor: tierRowColor(rowIndex, unranked), color: TIER_LABEL_INK }}
    >
      {label}
    </div>
  );
}
