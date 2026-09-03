import type { GroupByField, Printing } from "@openrift/shared";
import { getOrientation, legendDisplayName } from "@openrift/shared";
import { LinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { FinishIcon } from "@/components/cards/finish-icon";
import { PrintingChannelCell } from "@/components/cards/printing-channel-cell";
import { PrintingNotesCell } from "@/components/cards/printing-notes-cell";
import { Pressable } from "@/components/ui/pressable";
import { rowActivateProps } from "@/lib/card-row-interactions";
import { getFilterIconPath, getTypeIconPaths } from "@/lib/icons";
import { cn } from "@/lib/utils";

export const CARD_TABLE_ROW_HEIGHT = 56;
export const CARD_TABLE_HEADER_HEIGHT = 48;

/** Layout for the rightmost actions column. */
export type ActionsColumn = "none" | "narrow" | "stepper" | "wide";

/** The static (non-actions) columns the row and header render, left to right. */
type StaticColumnKey = "image" | "name" | "set" | "type" | "rarity" | "channel" | "notes";

interface StaticColumn {
  key: StaticColumnKey;
  /**
   * grid-template-columns track for this column when it is not the stretcher
   * (see {@link CardTableColumnOptions.stretch}). Never `auto` or `max-content`:
   * every row is its own grid, so a content-sized track would size per row and
   * the columns would stop lining up.
   */
  track: string;
  /** px contribution to the min-width floor (the name column uses its 180px min). */
  minPx: number;
}

const STATIC_COLUMNS: readonly StaticColumn[] = [
  // 72px holds an h-8 art strip (32px tall × ~45px wide at the landscape-card
  // ratio) plus the cell's px-3. The column was 60px while the thumb was
  // portrait and only ~29px wide.
  { key: "image", track: "72px", minPx: 72 },
  // Card names average 15 characters, so 240px seats the great majority and the
  // long tail truncates under its own title rather than holding width open on
  // every other row. Only a surface that points `stretch` elsewhere sees the
  // cap; the catalog still grows this column to fill the table.
  { key: "name", track: "minmax(180px, 240px)", minPx: 180 },
  { key: "set", track: "160px", minPx: 160 },
  { key: "type", track: "200px", minPx: 200 },
  { key: "rarity", track: "130px", minPx: 130 },
  // Two lines like the name column: the channel's own label, under the
  // breadcrumb of everything it hangs under. 200px is a floor, not a fit — a
  // deep channel's breadcrumb runs past 400px, which is why /promos makes this
  // the stretcher rather than the name.
  { key: "channel", track: "200px", minPx: 200 },
  // The floor holds the note icon plus three source marks, which covers every
  // cited printing in the catalog today. Above it the column is flexible so a
  // wide table spends its spare width spelling the note out rather than handing
  // all of it to the name column; the cell watches its own width and falls back
  // to the icons when the note would not fit.
  { key: "notes", track: "minmax(112px, 0.8fr)", minPx: 112 },
];

// What a surface gets when it names no columns of its own. `channel` and
// `notes` are left out: they only carry anything on promo printings, so on the
// catalog they would be an empty track on every row.
const DEFAULT_COLUMN_KEYS: readonly StaticColumnKey[] = ["image", "name", "set", "type", "rarity"];

// A group axis whose value is already spelled out in every group header makes
// the matching column redundant, so it's hidden while grouping by that axis.
// The other axes (superType, domain, channel, year, marker) have no column.
const GROUP_HIDDEN_COLUMN: Partial<Record<GroupByField, StaticColumnKey>> = {
  set: "set",
  type: "type",
  rarity: "rarity",
};

/** How a surface departs from the default column set. */
export interface CardTableColumnOptions {
  /**
   * The static columns this surface wants. Order is ignored — the table renders
   * them in the canonical left-to-right order either way, so the header, the
   * rows and the grid tracks cannot drift apart.
   */
  columns?: readonly StaticColumnKey[];
  /**
   * Which column absorbs the width past every column's minimum — it becomes the
   * `1fr` track and the rest stop at their own maximum. Defaults to `name`,
   * which is right when the alternatives are fixed-width facts (set, rarity);
   * point it at a column whose content actually scales instead, and name stops
   * growing into padding. Naming a column the surface does not render leaves the
   * table short of the container, so keep the two in step.
   */
  stretch?: StaticColumnKey;
}

// The static columns visible for the given column set, minus the one the
// group-by axis already spells out in every group header.
function visibleStaticColumns(
  groupBy?: GroupByField,
  options?: CardTableColumnOptions,
): readonly StaticColumn[] {
  const hidden = groupBy ? GROUP_HIDDEN_COLUMN[groupBy] : undefined;
  const wanted = new Set(options?.columns ?? DEFAULT_COLUMN_KEYS);
  return STATIC_COLUMNS.filter((column) => column.key !== hidden && wanted.has(column.key));
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
 * group headers already show its value. One column is flexible — see
 * {@link CardTableColumnOptions.stretch} — so the table always fills its
 * container and only ever grows the column that can use the room.
 *
 * @returns CSS grid-template-columns value.
 */
export function getCardTableColumns(
  actionsColumn: ActionsColumn,
  groupBy?: GroupByField,
  options?: CardTableColumnOptions,
): string {
  const stretch = options?.stretch ?? "name";
  const tracks = visibleStaticColumns(groupBy, options).map((column) =>
    column.key === stretch ? `minmax(${column.minPx}px, 1fr)` : column.track,
  );
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
export function getCardTableMinWidth(
  actionsColumn: ActionsColumn,
  groupBy?: GroupByField,
  options?: CardTableColumnOptions,
): number {
  const columns = visibleStaticColumns(groupBy, options);
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
  channel: "Channel",
  notes: "Notes",
};

interface CardTableHeaderProps {
  columns: string;
  actionsColumn: ActionsColumn;
  /** Group-by axis — the matching set/type/rarity column header is dropped. */
  groupBy?: GroupByField;
  /** Column set, mirroring what the rows below render. */
  options?: CardTableColumnOptions;
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
  options,
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
      {visibleStaticColumns(groupBy, options).map((column) => (
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
  /** Column set, mirroring what the header above renders. */
  options?: CardTableColumnOptions;
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
  options,
  cardTypeLabels,
  superTypeLabels,
  rarityLabels,
  setNameBySlug,
  onRowClick,
  actionsCell,
}: CardTableRowProps) {
  const image = printing.images[0];
  const cardName = legendDisplayName(printing.card);
  const setName = setNameBySlug.get(printing.setSlug) ?? printing.setSlug;
  const typeLabel = [
    ...printing.card.superTypes.map((slug) => superTypeLabels[slug]),
    ...printing.card.types.map((slug) => cardTypeLabels[slug]),
  ]
    .filter(Boolean)
    .join(" ");
  const typeIconPaths = getTypeIconPaths(printing.card.types, printing.card.superTypes);
  const rarityIconPath = getFilterIconPath("rarities", printing.rarity);
  const rarityLabel = rarityLabels[printing.rarity];

  const staticCellByKey: Record<StaticColumnKey, ReactNode> = {
    image: (
      <div className="px-3 py-1">
        {/* Art only — the table already spends columns on rarity and code, so
            the CardMiniRow cluster would duplicate them. */}
        <CardArtThumb
          shape="strip"
          imageId={image?.imageId}
          landscape={getOrientation(printing.card.types) === "landscape"}
          rarity={printing.rarity}
          domains={printing.card.domains}
          className="h-8"
          loading="lazy"
        />
      </div>
    ),
    name: (
      <div className="min-w-0 px-3">
        <div className="truncate font-medium" title={cardName}>
          {cardName}
        </div>
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <span className="truncate tabular-nums">{printing.publicCode}</span>
          <FinishIcon finish={printing.finish} className="shrink-0" />
        </div>
      </div>
    ),
    set: <div className="text-muted-foreground min-w-0 truncate px-3">{setName}</div>,
    type: (
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 px-3">
        {typeIconPaths.map((path) => (
          <img key={path} src={path} alt="" className="size-4 shrink-0 brightness-0 dark:invert" />
        ))}
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
    channel: (
      <div className="min-w-0 px-3">
        <PrintingChannelCell channels={printing.distributionChannels} />
      </div>
    ),
    notes: (
      <div className="min-w-0 overflow-hidden px-3">
        <PrintingNotesCell
          comment={printing.comment}
          markers={printing.markers}
          citations={printing.citations ?? []}
        />
      </div>
    ),
  };

  const handleClick = () => onRowClick(printing);

  return (
    <div
      {...rowActivateProps(handleClick)}
      role="row"
      data-printing-id={printing.id}
      className={cn(
        "grid cursor-pointer items-center gap-3 text-sm transition-colors outline-none",
        isSelected ? "bg-muted/50" : "hover:bg-muted/50",
      )}
      style={{ gridTemplateColumns: columns, height: CARD_TABLE_ROW_HEIGHT }}
    >
      {visibleStaticColumns(groupBy, options).map((column) => (
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
