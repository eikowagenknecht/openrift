import type { Printing } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { LinkIcon, MinusIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { FinishIcon } from "@/components/cards/finish-icon";
import { Button } from "@/components/ui/button";
import { getFilterIconPath, getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

export const CARD_TABLE_ROW_HEIGHT = 56;
export const CARD_TABLE_HEADER_HEIGHT = 48;

const COLUMN_WIDTHS_LOGGED_OUT = "60px minmax(180px, 1fr) 160px 200px 130px";
const COLUMN_WIDTHS_LOGGED_IN = `${COLUMN_WIDTHS_LOGGED_OUT} 80px`;
const COLUMN_WIDTHS_ADD_MODE = `${COLUMN_WIDTHS_LOGGED_OUT} 150px`;

/**
 * Resolve the gridTemplateColumns string for the card table — keeps every row,
 * the column header, and any group headers locked to identical track widths.
 * @returns CSS grid-template-columns value.
 */
export function getCardTableColumns(showOwned: boolean, showAddControls: boolean): string {
  if (showAddControls) {
    return COLUMN_WIDTHS_ADD_MODE;
  }
  if (showOwned) {
    return COLUMN_WIDTHS_LOGGED_IN;
  }
  return COLUMN_WIDTHS_LOGGED_OUT;
}

interface CardTableHeaderProps {
  columns: string;
  showOwned: boolean;
  showAddControls: boolean;
  /** When true, sticks to the top of the viewport at `stickyOffset`. */
  sticky?: boolean;
  stickyOffset?: number;
  /** Show a bottom border. Drop it when group headers will visually separate the body. */
  bordered?: boolean;
  /** Label for the rightmost column. Defaults to "Owned". */
  actionsLabel?: string;
}

/**
 * Column-header bar for the card table — used by the virtualized CardTable
 * (sticky) and the non-virtualized promo branch table (static).
 * @returns The column-header element.
 */
export function CardTableHeader({
  columns,
  showOwned,
  showAddControls,
  sticky,
  stickyOffset,
  bordered = true,
  actionsLabel = "Owned",
}: CardTableHeaderProps) {
  return (
    <div
      role="table"
      className={cn(
        "text-muted-foreground bg-background/80 z-10 grid gap-3 text-xs font-medium tracking-wide uppercase backdrop-blur-lg",
        sticky && "sticky",
        bordered && "border-b",
      )}
      style={{
        gridTemplateColumns: columns,
        height: CARD_TABLE_HEADER_HEIGHT,
        alignItems: "center",
        ...(sticky && stickyOffset !== undefined ? { top: stickyOffset } : {}),
      }}
    >
      <div className="px-3" />
      <div className="px-3">Name</div>
      <div className="px-3">Set</div>
      <div className="px-3">Type</div>
      <div className="px-3">Rarity</div>
      {(showOwned || showAddControls) && <div className="px-3 text-right">{actionsLabel}</div>}
    </div>
  );
}

interface CardTableGroupHeaderProps {
  columns: string;
  slug?: string;
  name: string;
  count: number;
  /** When provided, the header text becomes a button (e.g. scroll-to-group). */
  onClick?: () => void;
  /** When provided, renders a hover-visible `#anchorId` link next to the title. */
  anchorId?: string;
}

/**
 * Centered group-header row used between groups in the card table.
 * @returns The group-header row element.
 */
export function CardTableGroupHeader({
  columns,
  slug,
  name,
  count,
  onClick,
  anchorId,
}: CardTableGroupHeaderProps) {
  const content = (
    <span className="flex flex-row gap-3 text-sm">
      {slug && <span className="text-muted-foreground font-medium">{slug}</span>}
      <span className="font-semibold">{name}</span>
      <span className="text-muted-foreground tabular-nums">({count})</span>
    </span>
  );
  return (
    <div
      className="grid items-center gap-3 px-3"
      style={{ gridTemplateColumns: columns, height: CARD_TABLE_HEADER_HEIGHT }}
    >
      <div className="col-span-full flex items-center justify-center gap-2 py-2">
        {onClick ? (
          <button type="button" onClick={onClick} className="cursor-pointer">
            {content}
          </button>
        ) : (
          content
        )}
        {anchorId && (
          <a
            href={`#${anchorId}`}
            aria-label={`Link to ${name}`}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <LinkIcon className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

interface CardTableRowProps {
  printing: Printing;
  ownedCount: number | undefined;
  /** Aggregate owned count across all sibling variants (cards view). Rendered in parens next to the per-printing count in add mode when it differs from ownedCount. */
  totalOwnedCount?: number;
  isSelected?: boolean;
  showOwned: boolean;
  showAddControls: boolean;
  columns: string;
  cardTypeLabels: Record<string, string>;
  superTypeLabels: Record<string, string>;
  rarityLabels: Record<string, string>;
  setNameBySlug: Map<string, string>;
  onRowClick: (printing: Printing) => void;
  onIncrement?: (printing: Printing, modifiers?: { shift?: boolean }) => void;
  onDecrement?: (
    printing: Printing,
    anchorEl: HTMLElement,
    modifiers?: { shift?: boolean },
  ) => void;
  /** Optional override for the actions cell. Replaces the default +/- buttons. */
  renderActions?: (printing: Printing, ownedCount: number | undefined) => ReactNode;
}

/**
 * Pure-presentation row for the card table. Owned count + action handlers are
 * passed in so the component is reusable from both the virtualized CardTable
 * (which subscribes per-row via a live query) and non-virtualized callers
 * (which pass counts from a precomputed Record).
 * @returns The data-row element.
 */
export function CardTableRow({
  printing,
  ownedCount,
  totalOwnedCount,
  isSelected,
  showOwned,
  showAddControls,
  columns,
  cardTypeLabels,
  superTypeLabels,
  rarityLabels,
  setNameBySlug,
  onRowClick,
  onIncrement,
  onDecrement,
  renderActions,
}: CardTableRowProps) {
  const showTotal = totalOwnedCount !== undefined && totalOwnedCount !== ownedCount;
  const image = printing.images[0];
  const setName = setNameBySlug.get(printing.setSlug) ?? printing.setSlug;
  const typeLabel = [
    ...printing.card.superTypes.map((slug) => superTypeLabels[slug]),
    cardTypeLabels[printing.card.type],
  ]
    .filter(Boolean)
    .join(" ");
  const typeIconPath = getTypeIconPath(printing.card.type, printing.card.superTypes);
  const rarityIconPath = getFilterIconPath("rarities", printing.rarity);
  const rarityLabel = rarityLabels[printing.rarity];

  const handleClick = () => onRowClick(printing);

  return (
    <div
      role="row"
      tabIndex={0}
      data-printing-id={printing.id}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "grid cursor-pointer items-center gap-3 text-sm transition-colors outline-none",
        isSelected ? "bg-accent/50" : "hover:bg-muted/40",
      )}
      style={{ gridTemplateColumns: columns, height: CARD_TABLE_ROW_HEIGHT }}
    >
      <div className="px-3 py-1">
        {image ? (
          <img
            src={imageUrl(image.imageId, "120w")}
            alt=""
            className="aspect-card h-10 rounded object-cover"
            loading="lazy"
          />
        ) : (
          <div className="bg-muted aspect-card h-10 rounded" />
        )}
      </div>
      <div className="min-w-0 px-3">
        <div className="truncate font-medium">{printing.card.name}</div>
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <span className="truncate tabular-nums">{printing.publicCode}</span>
          <FinishIcon finish={printing.finish} className="shrink-0" />
        </div>
      </div>
      <div className="text-muted-foreground min-w-0 truncate px-3">{setName}</div>
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 px-3">
        {typeIconPath && (
          <img src={typeIconPath} alt="" className="size-4 shrink-0 brightness-0 dark:invert" />
        )}
        <span className="truncate">{typeLabel}</span>
      </div>
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 px-3">
        {rarityIconPath && (
          <img src={rarityIconPath} alt="" width={28} height={28} className="size-4 shrink-0" />
        )}
        <span className="truncate">{rarityLabel}</span>
      </div>
      {showAddControls ? (
        <div className="flex items-center justify-end gap-1.5 px-3">
          {renderActions ? (
            renderActions(printing, ownedCount)
          ) : (
            <>
              <span className="text-center font-medium tabular-nums">
                {ownedCount ?? 0}
                {showTotal && <span className="opacity-60"> ({totalOwnedCount})</span>}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onDecrement?.(printing, event.currentTarget, { shift: event.shiftKey });
                }}
                disabled={!ownedCount}
                aria-label="Remove one"
              >
                <MinusIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="default"
                size="icon-sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onIncrement?.(printing, { shift: event.shiftKey });
                }}
                aria-label="Add one"
              >
                <PlusIcon className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      ) : showOwned ? (
        <div className="px-3 text-right tabular-nums">
          {renderActions
            ? renderActions(printing, ownedCount)
            : ownedCount && ownedCount > 0
              ? `×${ownedCount}`
              : ""}
        </div>
      ) : null}
    </div>
  );
}
