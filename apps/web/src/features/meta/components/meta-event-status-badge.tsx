import type { MetaEventStatus } from "@openrift/shared/types/enums";

import { Badge } from "@/components/ui/badge";
import { META_EVENT_STATUS_LABELS } from "@/features/meta/lib/meta-format";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = { upcoming: "outline", in_progress: "warning" } as const;

/** Nothing for a complete event: that is the archive's normal state. */
export function MetaEventStatusBadge({
  status,
  className,
}: {
  status: MetaEventStatus;
  className?: string;
}) {
  if (status === "complete") {
    return null;
  }
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn("shrink-0", className)}>
      {META_EVENT_STATUS_LABELS[status]}
    </Badge>
  );
}
