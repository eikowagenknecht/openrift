import type { PrintingDistributionChannel } from "@openrift/shared";

import { cn } from "@/lib/utils";

const BREADCRUMB_SEP = " › ";

/**
 * Where a printing was handed out: the channel's own label, under the
 * breadcrumb of everything it hangs beneath. Shared by the card table's channel
 * column and the promo list's phone card, so the two never drift on how deep a
 * channel reads.
 *
 * A printing can hang off several channels. Only the first is named, with the
 * rest counted — neither surface has room for two breadcrumbs — and the title
 * carries every one in full.
 *
 * @returns The channel lines, or null when the printing has no channel.
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
      {/* Dimmer, not smaller: this renders at the table's text-sm and again at
          the phone card's own size, and a hardcoded step would be a third text
          size in whichever of the two it did not suit. */}
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
