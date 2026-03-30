import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Package } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOwnedCollections, useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface OwnedCollectionsPopoverProps {
  printingId: string;
  /** Override the displayed count (e.g. from stacked copies). Falls back to the global owned count. */
  count?: number;
  /** Horizontal alignment of the popover relative to the trigger. */
  align?: PopoverPrimitive.Positioner.Props["align"];
}

/**
 * Clickable owned-count badge that opens a popover showing per-collection breakdown.
 * Only renders when the user is authenticated and owns at least one copy of the printing.
 * @returns The popover, or null if the user is not authenticated or owns no copies.
 */
export function OwnedCollectionsPopover({
  printingId,
  count,
  align = "end",
}: OwnedCollectionsPopoverProps) {
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user);
  const { data: ownedCountByPrinting } = useOwnedCount(isAuthenticated);
  const totalOwned = count ?? ownedCountByPrinting?.[printingId] ?? 0;
  const { data: breakdown } = useOwnedCollections(printingId, isAuthenticated && totalOwned > 0);

  if (!isAuthenticated || totalOwned === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "bg-muted hover:bg-muted/80 inline-flex items-center gap-1 rounded-md px-2 py-0.5",
          "text-muted-foreground text-xs font-medium tabular-nums transition-colors",
          "cursor-pointer",
        )}
      >
        <Package className="size-3" />
        <span>&times;{totalOwned}</span>
      </PopoverTrigger>
      <PopoverContent side="bottom" align={align} className="w-56 p-0">
        <div className="px-3 pt-2.5 pb-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            In your collections
          </p>
        </div>
        <ul className="px-1 pb-1">
          {breakdown?.map((entry) => (
            <li
              key={entry.collectionId}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
            >
              <span className="truncate">{entry.collectionName}</span>
              <span className="text-muted-foreground ml-2 shrink-0 tabular-nums">
                &times;{entry.count}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
