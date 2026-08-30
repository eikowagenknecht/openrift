import type { MetaListStatus } from "@openrift/shared";

import { Badge } from "@/components/ui/badge";
import { META_LIST_STATUS_LABELS } from "@/lib/meta-format";
import { cn } from "@/lib/utils";

/**
 * The marker an incomplete archive entry carries (ADR-014): "Partial list" when
 * the main deck is there but the side zones may not be.
 *
 * A full list renders nothing. Marking it would put a badge on nearly every
 * deck in the archive and say only what a reader already assumes, so the badge
 * exists purely to flag the exception. `none` renders nothing either — a
 * standings-only entry has no deck surface to carry a badge on, and where the
 * archive lists one it says so in a column of its own.
 *
 * @returns The badge, or null for anything but a partial list.
 */
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
