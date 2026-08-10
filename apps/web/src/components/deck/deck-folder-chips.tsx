import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * How many chips render before the rest collapse into a "+N". A deck tile is
 * three to a row on desktop, so two names plus the overflow is what reliably
 * fits without pushing the format badge around.
 */
const VISIBLE_CHIPS = 2;

/**
 * The folders a deck is filed in, as chips.
 *
 * Renders nothing when the deck is in no folder, so an unfiled deck's tile is
 * exactly as tall as it was before folders existed. Names are resolved through
 * `folderLabels`; an id with no label (a folder deleted in another tab, before
 * the list refetches) is dropped rather than shown raw.
 * @returns The chip row, or null when there is nothing to show.
 */
export function DeckFolderChips({
  folderIds,
  folderLabels,
  className,
}: {
  folderIds: string[];
  folderLabels: Record<string, string>;
  className?: string;
}) {
  const names = folderIds
    .map((id) => folderLabels[id])
    .filter((name): name is string => name !== undefined);
  if (names.length === 0) {
    return null;
  }
  const shown = names.slice(0, VISIBLE_CHIPS);
  const hidden = names.slice(VISIBLE_CHIPS);

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {shown.map((name) => (
        <Badge key={name} variant="muted" className="max-w-full">
          <span className="truncate">{name}</span>
        </Badge>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger render={<Badge variant="muted" />}>+{hidden.length}</TooltipTrigger>
          <TooltipContent>{hidden.join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
