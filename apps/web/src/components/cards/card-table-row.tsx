import type { GroupByField, Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { LinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { FinishIcon } from "@/components/cards/finish-icon";
import { Pressable } from "@/components/ui/pressable";
import { getFilterIconPath, getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

export const CARD_TABLE_ROW_HEIGHT = 56;
export const CARD_TABLE_HEADER_HEIGHT = 48;

/** Layout for the rightmost actions column. */
export type ActionsColumn = "none" | "narrow" | "stepper" | "wide";

/** The static (non-actions) columns the row and header render, left to right. */
type StaticColumnKey = "image" | "name" | "set" | "type" | "rarity";

interface StaticColumn {
  key: StaticColumnKey;
  /** grid-template-columns track for this column. */
  track: string;
  /** px contribution to the min-width floor (the name column uses its 180px min). */
  minPx: number;
}

const STATIC_COLUMNS: readonly StaticColumn[] = [
  { key: "image", track: "60px", minPx: 60 },
  { key: "name", track: "minmax(180px, 1fr)", minPx: 180 },
  { key: "set", track: "160px", minPx: 160 },
  { key: "type", track: "200px", minPx: 200 },
  { key: "rarity", track: "130px", minPx: 130 },
];

// A group axis whose value is already spelled out in every group header makes
// the matching column redundant, so it's hidden while grouping by that axis.
// The other axes (superType, domain, channel, year, marker) have no column.
const GROUP_HIDDEN_COLUMN: Partial<Record<GroupByField, StaticColumnKey>> = {
  set: "set",
  type: "type",
  rarity: "rarity",
};

// The static columns visible for the given group-by axis (drops the grouped one).
function visibleStaticColumns(groupBy?: GroupByField): readonly StaticColumn[] {
  const hidden = groupBy ? GROUP_HIDDEN_COLUMN[groupBy] : undefined;
  return hidden ? STATIC_COLUMNS.filter((column) => column.key !== hidden) : STATIC_COLUMNS;
}

// Track width of the rightmost actions column. "narrow" is a read-only count;
// "stepper" adds the +/- buttons (collections browse); "wide" additionally fits
// the trade-pref pill + trash on list rows, with a little breathing room.
const ACTIONS_WIDTH_PX: Record<Exclude<ActionsColumn, "none">, number> = {
  narrow: 96,
  stepper: 150,
  wide: 220,
};

/**
 * Resolve the gridTemplateColumns string for the card table — keeps every row,
 * the column header, and any group headers locked to identical track widths.
 * The rightmost actions column follows `actionsColumn` ("none" omits it); when
 * `groupBy` matches a set/type/rarity column, that column is dropped since the
 * group headers already show its value.
 *
 * @returns CSS grid-template-columns value.
 */
export function getCardTableColumns(actionsColumn: ActionsColumn, groupBy?: GroupByField): string {
  const tracks = visibleStaticColumns(groupBy).map((column) => column.track);
  if (actionsColumn !== "none") {
    tracks.push(`${ACTIONS_WIDTH_PX[actionsColumn]}px`);
  }
  return tracks.join(" ");
}

// gap-3 (12px) between tracks. The table's horizontal-scroll wrapper uses the
// min-width below so cells stay readable when the surrounding flex column is
// squeezed (e.g. detail pane open at intermediate viewport widths).
const COLUMN_GAP = 12;

/**
 * Minimum total width (in px) of the table for the given actions-column variant
 * and group-by axis, used as the `min-width` of the horizontal-scroll wrapper.
 *
 * @returns Minimum table width in pixels.
 */
export function getCardTableMinWidth(actionsColumn: ActionsColumn, groupBy?: GroupByField): number {
  const columns = visibleStaticColumns(groupBy);
  const staticPx = columns.reduce((sum, column) => sum + column.minPx, 0);
  const actionsPx = actionsColumn === "none" ? 0 : ACTIONS_WIDTH_PX[actionsColumn];
  const trackCount = columns.length + (actionsColumn === "none" ? 0 : 1);
  return staticPx + actionsPx + (trackCount - 1) * COLUMN_GAP;
}

const STATIC_COLUMN_HEADER: Record<StaticColumnKey, string> = {
  image: "",
  name: "Name",
  set: "Set",
  type: "Type",
  rarity: "Rarity",
};

interface CardTableHeaderProps {
  columns: string;
  actionsColumn: ActionsColumn;
  /** Group-by axis — the matching set/type/rarity column header is dropped. */
  groupBy?: GroupByField;
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
  groupBy,
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
      {visibleStaticColumns(groupBy).map((column) => (
        <div key={column.key} className="px-3">
          {STATIC_COLUMN_HEADER[column.key]}
        </div>
      ))}
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
        {onClick ? <Pressable onClick={onClick}>{content}</Pressable> : content}
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
  /** Group-by axis — the matching set/type/rarity cell is dropped to mirror the header. */
  groupBy?: GroupByField;
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
  groupBy,
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

  const staticCellByKey: Record<StaticColumnKey, ReactNode> = {
    image: (
      <div className="px-3 py-1">
        <CardArtThumb imageId={image?.imageId} className="h-10" loading="lazy" />
      </div>
    ),
    name: (
      <div className="min-w-0 px-3">
        <div className="truncate font-medium">{legendDisplayName(printing.card)}</div>
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <span className="truncate tabular-nums">{printing.publicCode}</span>
          <FinishIcon finish={printing.finish} className="shrink-0" />
        </div>
      </div>
    ),
    set: <div className="text-muted-foreground min-w-0 truncate px-3">{setName}</div>,
    type: (
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 px-3">
        {typeIconPath && (
          <img src={typeIconPath} alt="" className="size-4 shrink-0 brightness-0 dark:invert" />
        )}
        <span className="truncate">{typeLabel}</span>
      </div>
    ),
    rarity: (
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 px-3">
        {rarityIconPath && (
          <img src={rarityIconPath} alt="" width={28} height={28} className="size-4 shrink-0" />
        )}
        <span className="truncate">{rarityLabel}</span>
      </div>
    ),
  };

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
      {visibleStaticColumns(groupBy).map((column) => (
        <Fragment key={column.key}>{staticCellByKey[column.key]}</Fragment>
      ))}
      {actionsColumn === "wide" || actionsColumn === "stepper" ? (
        <div className="flex items-center justify-end gap-1.5 px-3">{actionsCell}</div>
      ) : actionsColumn === "narrow" ? (
        <div className="px-3 text-right tabular-nums">{actionsCell}</div>
      ) : null}
    </div>
  );
}
