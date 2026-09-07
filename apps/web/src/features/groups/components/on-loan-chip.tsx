import { HandHeartIcon } from "lucide-react";

import { CountPill } from "@/components/ui/count-pill";

export function OnLoanChip({
  count,
  totalCount,
  iconOnly,
}: {
  count: number;
  totalCount?: number;
  iconOnly?: boolean;
}) {
  const showTotal = totalCount !== undefined && totalCount !== count;
  if (count <= 0 && !showTotal) {
    return null;
  }
  const title = iconOnly
    ? "On loan"
    : showTotal
      ? `${count} of this printing on loan (${totalCount} across all printings)`
      : `${count} ${count === 1 ? "copy" : "copies"} on loan`;
  return (
    <CountPill variant="ghost" title={title} aria-label={title}>
      <HandHeartIcon className="size-3" aria-hidden />
      {!iconOnly && (
        <>
          <span>{count}</span>
          {showTotal && <span className="opacity-60">({totalCount})</span>}
        </>
      )}
    </CountPill>
  );
}
