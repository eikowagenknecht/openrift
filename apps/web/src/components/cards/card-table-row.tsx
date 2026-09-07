import type { Printing } from "@openrift/shared/types/catalog";
import type { GroupByField } from "@openrift/shared/types/search";
import { getOrientation, legendDisplayName } from "@openrift/shared/utils";
import { LinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { FinishIcon } from "@/components/cards/finish-icon";
import { PrintingChannelCell } from "@/components/cards/printing-channel-cell";
import { PrintingNotesCell } from "@/components/cards/printing-notes-cell";
import { Pressable } from "@/components/ui/pressable";
import { rowActivateProps } from "@/lib/card-row-interactions";
import type { ActionsColumn } from "@/lib/collection-table";
import { getFilterIconPath, getTypeIconPaths } from "@/lib/icons";
import { cn } from "@/lib/utils";

export const CARD_TABLE_ROW_HEIGHT = 56;
export const CARD_TABLE_HEADER_HEIGHT = 48;

type StaticColumnKey = "image" | "name" | "set" | "type" | "rarity" | "channel" | "notes";

interface StaticColumn {
  key: StaticColumnKey;
  track: string;
  minPx: number;
}

const STATIC_COLUMNS: readonly StaticColumn[] = [
  { key: "image", track: "72px", minPx: 72 },
  { key: "name", track: "minmax(180px, 240px)", minPx: 180 },
  { key: "set", track: "160px", minPx: 160 },
  { key: "type", track: "200px", minPx: 200 },
  { key: "rarity", track: "130px", minPx: 130 },
  { key: "channel", track: "200px", minPx: 200 },
  { key: "notes", track: "minmax(112px, 0.8fr)", minPx: 112 },
];

const DEFAULT_COLUMN_KEYS: readonly StaticColumnKey[] = ["image", "name", "set", "type", "rarity"];

const GROUP_HIDDEN_COLUMN: Partial<Record<GroupByField, StaticColumnKey>> = {
  set: "set",
  type: "type",
  rarity: "rarity",
};

export interface CardTableColumnOptions {
  columns?: readonly StaticColumnKey[];
  stretch?: StaticColumnKey;
}

function visibleStaticColumns(
  groupBy?: GroupByField,
  options?: CardTableColumnOptions,
): readonly StaticColumn[] {
  const hidden = groupBy ? GROUP_HIDDEN_COLUMN[groupBy] : undefined;
  const wanted = new Set(options?.columns ?? DEFAULT_COLUMN_KEYS);
  return STATIC_COLUMNS.filter((column) => column.key !== hidden && wanted.has(column.key));
}

const ACTIONS_WIDTH_PX: Record<Exclude<ActionsColumn, "none">, number> = {
  narrow: 96,
  stepper: 150,
  wide: 220,
};

/**
 * Keeps every row, the column header, and any group headers locked to
 * identical grid-template-columns track widths.
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

const COLUMN_GAP = 12;

/** Used as the `min-width` of the table's horizontal-scroll wrapper. */
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
  groupBy?: GroupByField;
  options?: CardTableColumnOptions;
  sticky?: boolean;
  stickyOffset?: number;
  bordered?: boolean;
  actionsLabel?: string;
}

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
  onClick?: () => void;
  anchorId?: string;
}

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
  groupBy?: GroupByField;
  options?: CardTableColumnOptions;
  cardTypeLabels: Record<string, string>;
  superTypeLabels: Record<string, string>;
  rarityLabels: Record<string, string>;
  setNameBySlug: Map<string, string>;
  onRowClick: (printing: Printing) => void;
  actionsCell?: ReactNode;
  itemId?: string;
}

/**
 * Owned counts, +/- buttons, and per-row data subscriptions live in the
 * actions component passed via `actionsCell`, not here.
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
