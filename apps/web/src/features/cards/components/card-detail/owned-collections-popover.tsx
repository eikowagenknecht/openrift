import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Link } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";
import { useContext } from "react";

import { COUNT_PILL_INTERACTIVE, countPillVariants } from "@/components/ui/count-pill";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SectionHeading } from "@/components/ui/section-heading";
import { OwnedVariantBreakdown } from "@/features/cards/components/owned-variant-breakdown";
import { FilterSearchProvider } from "@/features/cards/lib/search-schemas";
import type { OwnedBreakdownVariant } from "@/features/collections/hooks/use-owned-count";
import {
  useOwnedCollections,
  useOwnedCollectionsByVariants,
  useOwnedCount,
} from "@/features/collections/hooks/use-owned-count";
import { useSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

interface OwnedCollectionsPopoverProps {
  printingId: string;
  cardName: string;
  shortCode: string;
  count?: number;
  siblings?: readonly OwnedBreakdownVariant[];
  totalCount?: number;
  align?: PopoverPrimitive.Positioner.Props["align"];
}

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
  // Must stay gated: an enabled instance subscribes to the entire copies collection.
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
  // Optional: CardDetailOverlay renders this outside any FilterSearchProvider.
  const filterSearch = useContext(FilterSearchProvider);
  const defaultView = useDisplayStore((state) => state.defaultCardView);
  const view = filterSearch?.view ?? defaultView;
  const isPrintingsView = view === "printings" || view === "copies";

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
          <SectionHeading as="h3">In your collections</SectionHeading>
        </div>
        {groupByVariant ? (
          <OwnedVariantBreakdown variants={variantBreakdown ?? []} />
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
                    "hover:bg-muted transition-colors",
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
