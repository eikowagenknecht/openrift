import type { Printing } from "@openrift/shared";
import { LinkIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { FinishIcon } from "@/components/cards/finish-icon";
import { getFilterIconPath, getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

export const CARD_TABLE_ROW_HEIGHT = 56;
export const CARD_TABLE_HEADER_HEIGHT = 48;

/** Layout for the rightmost actions column. */
export type ActionsColumn = "none" | "narrow" | "wide";

const COLUMN_WIDTHS_NO_ACTIONS = "60px minmax(180px, 1fr) 160px 200px 130px";
const COLUMN_WIDTHS_NARROW = `${COLUMN_WIDTHS_NO_ACTIONS} 80px`;
// The "wide" actions cell fits the trade-pref pill (icon + abbreviation/price)
// alongside the quantity stepper and trash button on list rows, with a little
// breathing room. Catalog/deck surfaces only render the quantity stepper here,
// so the extra width is harmless padding on those.
const COLUMN_WIDTHS_WIDE = `${COLUMN_WIDTHS_NO_ACTIONS} 220px`;

/**
 * Resolve the gridTemplateColumns string for the card table — keeps every row,
 * the column header, and any group headers locked to identical track widths.
 * Width follows the actions column: "narrow" (80px, read-only count), "wide"
 * (220px, +/- buttons plus a trade-pref pill on list rows), or "none" (column
 * omitted entirely).
 *
 * @returns CSS grid-template-columns value.
 */
export function getCardTableColumns(actionsColumn: ActionsColumn): string {
  if (actionsColumn === "wide") {
    return COLUMN_WIDTHS_WIDE;
  }
  if (actionsColumn === "narrow") {
    return COLUMN_WIDTHS_NARROW;
  }
  return COLUMN_WIDTHS_NO_ACTIONS;
}

// Sum of fixed column widths + the 1fr's 180px minimum + gap-3 (12px) between
// tracks. The table's horizontal-scroll wrapper uses this so cells stay readable
// when the surrounding flex column is squeezed (e.g. detail pane open at
// intermediate viewport widths).
const COLUMN_GAP = 12;
const FIXED_BASE_PX = 60 + 180 + 160 + 200 + 130;

/**
 * Minimum total width (in px) of the table at the given actions-column variant,
 * used as the `min-width` of the horizontal-scroll wrapper.
 *
 * @returns Minimum table width in pixels.
 */
export function getCardTableMinWidth(actionsColumn: ActionsColumn): number {
  if (actionsColumn === "wide") {
    return FIXED_BASE_PX + 220 + 5 * COLUMN_GAP;
  }
  if (actionsColumn === "narrow") {
    return FIXED_BASE_PX + 80 + 5 * COLUMN_GAP;
  }
  return FIXED_BASE_PX + 4 * COLUMN_GAP;
}

interface CardTableHeaderProps {
  columns: string;
  actionsColumn: ActionsColumn;
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
  actionsColumn,
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
      {actionsColumn !== "none" && <div className="px-3 text-right">{actionsLabel}</div>}
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
  isSelected?: boolean;
  actionsColumn: ActionsColumn;
  columns: string;
  cardTypeLabels: Record<string, string>;
  superTypeLabels: Record<string, string>;
  rarityLabels: Record<string, string>;
  setNameBySlug: Map<string, string>;
  onRowClick: (printing: Printing) => void;
  /**
   * Pre-bound content for the rightmost cell. Required when
   * `actionsColumn !== "none"`. The wrapper styling (right-aligned text for
   * "narrow", flex+gap for "wide") is owned by the row.
   */
  actionsCell?: ReactNode;
  /**
   * Item id for this row. Surfaces with multiple items per printing (e.g.
   * copy-kind lists) target the specific entry; falls back to `printing.id`
   * when the surface has 1:1 items-to-printings.
   */
  itemId?: string;
}

/**
 * Pure-presentation row for the card table. Owned counts, +/- buttons, and
 * any per-row data subscriptions live in the actions component passed via
 * {@link CardTableRowProps.actionsCell} (e.g. CatalogTableActions,
 * CollectionTableActions, StaticCountTableActions, DeckTableActions). The row
 * only owns the static cells (image, name, set, type, rarity) and the click
 * dispatch.
 * @returns The data-row element.
 */
export function CardTableRow({
  printing,
  itemId: _itemId,
  isSelected,
  actionsColumn,
  columns,
  cardTypeLabels,
  superTypeLabels,
  rarityLabels,
  setNameBySlug,
  onRowClick,
  actionsCell,
}: CardTableRowProps) {
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
        <CardArtThumb imageId={image?.imageId} className="h-10" loading="lazy" />
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
      {actionsColumn === "wide" ? (
        <div className="flex items-center justify-end gap-1.5 px-3">{actionsCell}</div>
      ) : actionsColumn === "narrow" ? (
        <div className="px-3 text-right tabular-nums">{actionsCell}</div>
      ) : null}
    </div>
  );
}
