import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Link } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";

import { FinishIcon } from "@/components/cards/finish-icon";
import { COUNT_PILL_INTERACTIVE, countPillVariants } from "@/components/ui/count-pill";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFilterValues } from "@/hooks/use-card-filters";
import { useEnumOrders } from "@/hooks/use-enums";
import type { OwnedBreakdownVariant } from "@/hooks/use-owned-count";
import {
  useOwnedCollections,
  useOwnedCollectionsByVariants,
  useOwnedCount,
} from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

interface OwnedCollectionsPopoverProps {
  printingId: string;
  /** Card name used to filter by name in cards view. */
  cardName: string;
  /** Printing short code used to filter by id in printings view. */
  shortCode: string;
  /** Override the displayed count (e.g. from stacked copies). Falls back to the global owned count. */
  count?: number;
  /** All sibling variants of the same card (cards view). When provided with >1 entries, the breakdown groups by variant. */
  siblings?: readonly OwnedBreakdownVariant[];
  /** Wider-scope total (e.g. global across collections). When set and different from `count`, the trigger renders `N (M)`. */
  totalCount?: number;
  /** Horizontal alignment of the popover relative to the trigger. */
  align?: PopoverPrimitive.Positioner.Props["align"];
}

/**
 * Clickable owned-count badge that opens a popover showing owned breakdown.
 * In cards view (with siblings), entries are grouped by variant; otherwise it shows a flat per-collection list for the single printing.
 * Only renders when the user is authenticated and owns at least one copy of the printing.
 * @returns The popover, or null if the user is not authenticated or owns no copies.
 */
export function OwnedCollectionsPopover({
  printingId,
  cardName,
  shortCode,
  count,
  siblings,
  totalCount,
  align = "end",
}: OwnedCollectionsPopoverProps) {
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user);
  // The map-wide owned query is only a fallback for callers that don't pass
  // `count` (the detail-pane printing picker). Grid cells always pass it, and
  // every enabled instance subscribes to the ENTIRE copies collection — so an
  // ungated call here would add one full-collection live query per visible
  // cell, torn down and rebuilt on each cell remount.
  const { data: ownedCountByPrinting } = useOwnedCount(isAuthenticated && count === undefined);
  const totalOwned = count ?? ownedCountByPrinting?.[printingId] ?? 0;
  const showTotal = totalCount !== undefined && totalCount !== totalOwned;
  const groupByVariant = Boolean(siblings && siblings.length > 1);
  const { data: singleBreakdown } = useOwnedCollections(
    printingId,
    isAuthenticated && totalOwned > 0 && !groupByVariant,
  );
  const { data: variantBreakdown } = useOwnedCollectionsByVariants(
    siblings ?? [],
    isAuthenticated && totalOwned > 0 && groupByVariant,
  );
  const { view } = useFilterValues();
  const isPrintingsView = view === "printings" || view === "copies";
  const { labels } = useEnumOrders();

  if (!isAuthenticated || totalOwned === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger
        onClick={(event) => event.stopPropagation()}
        className={cn(countPillVariants({ variant: "ghost" }), COUNT_PILL_INTERACTIVE)}
      >
        <PackageIcon className="size-3" />
        <span>{totalOwned}</span>
        {showTotal && <span className="opacity-60"> ({totalCount})</span>}
      </PopoverTrigger>
      <PopoverContent side="bottom" align={align} className="w-60 p-0">
        <div className="px-3 pt-2.5 pb-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            In your collections
          </p>
        </div>
        {groupByVariant ? (
          <div className="px-1 pb-1">
            {variantBreakdown?.map((variant) => (
              <div key={variant.printingId} className="px-1 pb-1 last:pb-0">
                <div className="text-muted-foreground flex items-center gap-1.5 px-2 pt-1.5 pb-0.5 text-xs font-medium tracking-wide uppercase">
                  <span>{variant.shortCode}</span>
                  <FinishIcon
                    finish={variant.finish}
                    title={labels.finishes[variant.finish]}
                    iconClassName="size-3"
                  />
                </div>
                <ul>
                  {variant.collections.map((entry) => (
                    <li key={entry.collectionId}>
                      <Link
                        to="/collections/$collectionId"
                        params={{ collectionId: entry.collectionId }}
                        search={{ search: `id:${variant.shortCode}`, view: "printings" }}
                        className={cn(
                          "flex items-center justify-between rounded-md px-2 py-1 text-sm",
                          "hover:bg-accent transition-colors",
                        )}
                      >
                        <span className="truncate">{entry.collectionName}</span>
                        <span className="text-muted-foreground ml-2 shrink-0 tabular-nums">
                          &times;{entry.count}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="px-1 pb-1">
            {singleBreakdown?.map((entry) => (
              <li key={entry.collectionId}>
                <Link
                  to="/collections/$collectionId"
                  params={{ collectionId: entry.collectionId }}
                  search={
                    isPrintingsView
                      ? { search: `id:${shortCode}`, view: "printings" }
                      : { search: cardName }
                  }
                  className={cn(
                    "flex items-center justify-between rounded-md px-2 py-1.5 text-sm",
                    "hover:bg-accent transition-colors",
                  )}
                >
                  <span className="truncate">{entry.collectionName}</span>
                  <span className="text-muted-foreground ml-2 shrink-0 tabular-nums">
                    &times;{entry.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
