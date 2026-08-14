import type { MetaListStatus } from "@openrift/shared";

import { Badge } from "@/components/ui/badge";
import { META_LIST_STATUS_LABELS } from "@/lib/meta-format";
import { cn } from "@/lib/utils";

/**
 * The marker an incomplete archive entry carries (ADR-014): "Partial list" when
 * the main deck is there but the side zones may not be, "Archetype only" when
 * all the source named was the legend and maybe the champion.
 *
 * A full list renders nothing. Marking it would put a badge on nearly every
 * deck in the archive and say only what a reader already assumes, so the badge
 * exists purely to flag the exceptions.
 *
 * @returns The badge, or null for a full list.
 */
export function MetaListStatusBadge({
  listStatus,
  className,
}: {
  listStatus: MetaListStatus;
  className?: string;
}) {
  if (listStatus === "full") {
    return null;
  }
  return (
    <Badge variant="muted" className={cn("shrink-0", className)}>
      {META_LIST_STATUS_LABELS[listStatus]}
    </Badge>
  );
}
