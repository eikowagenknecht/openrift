import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { MinusIcon, PackageIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";

import { COUNT_PILL_BASE, COUNT_PILL_INTERACTIVE } from "@/components/cards/count-pill";
import { FinishIcon } from "@/components/cards/finish-icon";
import { Button } from "@/components/ui/button";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFilterValues } from "@/hooks/use-card-filters";
import { useEnumOrders } from "@/hooks/use-enums";
import { useOwnedCollections, useOwnedCollectionsByVariants } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-session";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface BrowseLocationsPopoverProps {
  /** The printing currently displayed on the cell (used for the single-variant breakdown and as the popover anchor identity). */
  displayedPrinting: Printing;
  /**
   * All sibling printings of the same card. Pass in cards view; omit/leave undefined in printings view.
   * When length > 1, a Variants section with `+/-` is rendered on top.
   */
  siblings?: readonly Printing[];
  /** Owned count for the pill (the same value the strip would otherwise show). */
  ownedCount: number;
  /** Total across all siblings; renders `(M)` next to the pill when it differs from ownedCount. */
  totalCount?: number;
  /** Owned counts per printing id; consulted to label each variant row. */
  ownedCountByPrinting: Record<string, number> | undefined;
  /** Increment handler for a specific printing. Used by the Variants section's `+`. */
  onAdd: (printing: Printing) => void;
  /** Decrement handler for a specific printing. The anchor is the row's `-` button (used to anchor a downstream picker). */
  onUndoAdd: (printing: Printing, anchorEl: HTMLElement) => void;
}

/**
 * Pill-triggered popover used in browse mode on the All Cards page. Combines
 * variant add/remove (cards view, >1 siblings) with a per-collection breakdown
 * of where the user's copies live. On a specific collection page the standard
 * variant chooser is shown instead — knowing "where this card is" is
 * tautological when you're already looking at one collection.
 *
 * @returns A Popover whose trigger renders the standard `×N` count pill.
 */
export function BrowseLocationsPopover({
  displayedPrinting,
  siblings,
  ownedCount,
  totalCount,
  ownedCountByPrinting,
  onAdd,
  onUndoAdd,
}: BrowseLocationsPopoverProps) {
  const showVariantsSection = (siblings?.length ?? 0) > 1;
  const showTotal = totalCount !== undefined && totalCount !== ownedCount;
  const hasOwnedCopies = ownedCount > 0;

  return (
    <Popover>
      <PopoverTrigger
        onClick={(event) => event.stopPropagation()}
        className={cn(COUNT_PILL_BASE, COUNT_PILL_INTERACTIVE, !hasOwnedCopies && "opacity-50")}
      >
        <PackageIcon className="size-3" />
        <span>&times;{ownedCount}</span>
        {showTotal && <span className="opacity-60"> ({totalCount})</span>}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="max-h-96 w-max max-w-[min(90vw,24rem)] min-w-60 overflow-y-auto p-0"
      >
        {showVariantsSection && siblings ? (
          <VariantsSection
            printings={siblings}
            ownedCountByPrinting={ownedCountByPrinting}
            onAdd={onAdd}
            onUndoAdd={onUndoAdd}
          />
        ) : null}
        <LocationsSection
          displayedPrinting={displayedPrinting}
          siblings={showVariantsSection ? siblings : undefined}
          ownedCount={ownedCount}
        />
      </PopoverContent>
    </Popover>
  );
}

interface VariantsSectionProps {
  printings: readonly Printing[];
  ownedCountByPrinting: Record<string, number> | undefined;
  onAdd: (printing: Printing) => void;
  onUndoAdd: (printing: Printing, anchorEl: HTMLElement) => void;
}

function VariantsSection({
  printings,
  ownedCountByPrinting,
  onAdd,
  onUndoAdd,
}: VariantsSectionProps) {
  const { labels } = useEnumOrders();
  const hasMixedRarities = new Set(printings.map((p) => p.rarity)).size > 1;
  const printingsList = [...printings];
  const printingsById = new Map(printingsList.map((p) => [p.id, p]));
  const [highlightedId, setHighlightedId] = useState("");
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  return (
    <PickerList
      highlightedId={highlightedId}
      onHighlightChange={setHighlightedId}
      onKeyDown={(event, id) => {
        const printing = printingsById.get(id);
        if (!printing) {
          return;
        }
        // `=` is a no-shift alias for `+` (US layouts need Shift+=).
        const isIncrement = event.key === "+" || event.key === "=" || event.key === "Enter";
        const isDecrement = event.key === "-";
        if (isIncrement) {
          event.preventDefault();
          onAdd(printing);
          return;
        }
        if (isDecrement) {
          const owned = ownedCountByPrinting?.[id] ?? 0;
          if (owned === 0) {
            return;
          }
          event.preventDefault();
          const anchor = rowRefs.current[id];
          if (anchor) {
            onUndoAdd(printing, anchor);
          }
        }
      }}
      header={
        <div className="px-2.5 pt-2 pb-0.5">
          <p className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
            Variants
          </p>
        </div>
      }
    >
      {printingsList.map((printing) => {
        const owned = ownedCountByPrinting?.[printing.id] ?? 0;
        const rarityIcon = getFilterIconPath("rarities", printing.rarity);
        return (
          <PickerRow
            key={printing.id}
            value={printing.id}
            className="py-0.5"
            ref={(el) => {
              rowRefs.current[printing.id] = el;
            }}
          >
            <div className="flex flex-1 items-center gap-1.5 whitespace-nowrap">
              {hasMixedRarities && rarityIcon && (
                <img
                  src={rarityIcon}
                  alt={printing.rarity}
                  title={printing.rarity}
                  width={28}
                  height={28}
                  className="size-3.5 shrink-0"
                />
              )}
              <span className="text-muted-foreground text-2xs shrink-0 font-mono">
                {formatCardId(printing)}
              </span>
              <span>
                {formatPrintingLabel(printing, printingsList, labels) || printing.setSlug}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                tabIndex={-1}
                size="icon-xs"
                variant="ghost"
                onClick={(event) => onUndoAdd(printing, event.currentTarget)}
                disabled={owned === 0}
                aria-label={`Remove ${legendDisplayName(printing.card)}`}
              >
                <MinusIcon />
              </Button>
              <span className="text-muted-foreground w-5 text-center tabular-nums">{owned}</span>
              <Button
                type="button"
                tabIndex={-1}
                size="icon-xs"
                variant="ghost"
                onClick={() => onAdd(printing)}
                aria-label={`Add ${legendDisplayName(printing.card)}`}
              >
                <PlusIcon />
              </Button>
            </div>
          </PickerRow>
        );
      })}
    </PickerList>
  );
}

interface LocationsSectionProps {
  displayedPrinting: Printing;
  /** Pass siblings when the locations should be grouped by variant; omit for a flat per-collection list. */
  siblings: readonly Printing[] | undefined;
  ownedCount: number;
}

function LocationsSection({ displayedPrinting, siblings, ownedCount }: LocationsSectionProps) {
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user);
  const { view } = useFilterValues();
  const isPrintingsView = view === "printings" || view === "copies";
  const { labels } = useEnumOrders();
  const groupByVariant = Boolean(siblings && siblings.length > 1);

  const { data: singleBreakdown } = useOwnedCollections(
    displayedPrinting.id,
    isAuthenticated && ownedCount > 0 && !groupByVariant,
  );
  const { data: variantBreakdown } = useOwnedCollectionsByVariants(
    siblings ?? [],
    isAuthenticated && ownedCount > 0 && groupByVariant,
  );

  return (
    <div className="border-t">
      <div className="px-3 pt-2.5 pb-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          In your collections
        </p>
      </div>
      {ownedCount === 0 ? (
        <p className="text-muted-foreground px-3 pb-2 text-sm">
          You don&apos;t own any copies yet.
        </p>
      ) : groupByVariant ? (
        <div className="px-1 pb-1">
          {variantBreakdown?.map((variant) => (
            <div key={variant.printingId} className="px-1 pb-1 last:pb-0">
              <div className="text-muted-foreground flex items-center gap-1.5 px-2 pt-1.5 pb-0.5 text-xs font-medium tracking-wide uppercase">
                <span>{variant.shortCode}</span>
                <FinishIcon
                  finish={variant.finish}
                  title={labels.finishes[variant.finish] ?? variant.finish}
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
                    ? { search: `id:${displayedPrinting.shortCode}`, view: "printings" }
                    : { search: displayedPrinting.card.name }
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
    </div>
  );
}
