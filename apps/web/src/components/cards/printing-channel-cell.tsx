import type { PrintingDistributionChannel } from "@openrift/shared/types/catalog";

import { cn } from "@/lib/utils";

const BREADCRUMB_SEP = " › ";

/**
 * Shared by the card table's channel column and the promo list's phone card
 * so the two never drift on how deep a channel reads.
 */
export function PrintingChannelCell({
  channels,
  className,
}: {
  channels: readonly PrintingDistributionChannel[];
  className?: string;
}) {
  const first = channels[0];
  if (!first) {
    return null;
  }
  const extraCount = channels.length - 1;
  const title = channels
    .map((link) => [...link.ancestorLabels, link.channel.label].join(BREADCRUMB_SEP))
    .join("\n");
  return (
    <div className={cn("text-muted-foreground min-w-0", className)} title={title}>
      {/* Dim, don't shrink: this renders at two different text sizes across
          the two callers, and a fixed size here would clash with one. */}
      {first.ancestorLabels.length > 0 && (
        <div className="text-muted-foreground/70 truncate">
          {first.ancestorLabels.join(BREADCRUMB_SEP)}
        </div>
      )}
      <div className="truncate">
        {first.channel.label}
        {extraCount > 0 && <span className="text-muted-foreground/70"> +{extraCount}</span>}
      </div>
    </div>
  );
}
