import type { MetaListStatus } from "@openrift/shared";

import { Badge } from "@/components/ui/badge";
import { META_LIST_STATUS_LABELS } from "@/lib/meta-format";
import { cn } from "@/lib/utils";

/** Renders nothing for "full" or "none" on purpose; only "partial" gets a badge. */
export function MetaListStatusBadge({
  listStatus,
  className,
}: {
  listStatus: MetaListStatus;
  className?: string;
}) {
  if (listStatus !== "partial") {
    return null;
  }
  return (
    <Badge variant="muted" className={cn("shrink-0", className)}>
      {META_LIST_STATUS_LABELS[listStatus]}
    </Badge>
  );
}
