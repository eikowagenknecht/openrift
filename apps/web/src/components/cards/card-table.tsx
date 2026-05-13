import type { EnumOrders, GroupByField, Printing } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { SearchXIcon, WifiOffIcon } from "lucide-react";
import type { ReactNode } from "react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { useEnumOrders } from "@/hooks/use-enums";
import { useOwnedCountFor } from "@/hooks/use-owned-count";
import { groupItemsByChannel } from "@/lib/group-by-channel";
import { groupItemsByMarker } from "@/lib/group-by-marker";
import { groupItemsByYear } from "@/lib/group-by-year";
import { getHeaderHeight } from "@/lib/header-height";
import { useWindowVirtualizerFresh } from "@/lib/virtualizer-fresh";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";

import type { GroupInfo, VRow } from "./card-grid-types";
import {
  CARD_TABLE_HEADER_HEIGHT,
  CARD_TABLE_ROW_HEIGHT,
  CardTableGroupHeader,
  CardTableHeader,
  CardTableRow,
  getCardTableColumns,
} from "./card-table-row";

const GAP = 0;

interface CardGroup {
  group: GroupInfo;
  items: CardViewerItem[];
}

function groupItemsBySet(items: CardViewerItem[], setOrder: GroupInfo[]): CardGroup[] {
  const bySet = Map.groupBy(items, (item) => item.printing.setId);
  return setOrder.flatMap((info) => {
    const setItems = bySet.get(info.id);
    return setItems ? [{ group: info, items: setItems }] : [];
  });
}

function groupItemsByField(
  items: CardViewerItem[],
  groupBy: Exclude<GroupByField, "none" | "set" | "channel" | "year" | "marker">,
  orders: Omit<EnumOrders, "finishes">,
): CardGroup[] {
  interface FieldConfig {
    order: readonly string[];
    getKeysAndItems: (item: CardViewerItem) => { key: string; mapped: CardViewerItem }[];
  }

  const config: Record<typeof groupBy, FieldConfig> = {
    type: {
      order: orders.cardTypes,
      getKeysAndItems: (item) => [{ key: item.printing.card.type, mapped: item }],
    },
    superType: {
      order: orders.superTypes,
      getKeysAndItems: (item) => {
        const supers = item.printing.card.superTypes;
        const keys = supers.length > 0 ? supers : ["(None)"];
        return keys.map((key) => ({ key, mapped: item }));
      },
    },
    domain: {
      order: orders.domains,
      getKeysAndItems: (item) => {
        const doms = item.printing.card.domains;
        const keys = doms.length > 0 ? doms : [WellKnown.domain.COLORLESS];
        return keys.map((key) => ({ key, mapped: item }));
      },
    },
    rarity: {
      order: orders.rarities,
      getKeysAndItems: (item) => [{ key: item.printing.rarity, mapped: item }],
    },
  };

  const { order, getKeysAndItems } = config[groupBy];
  const allKeys = new Set<string>();
  const buckets = new Map<string, CardViewerItem[]>();
  for (const item of items) {
    for (const { key, mapped } of getKeysAndItems(item)) {
      allKeys.add(key);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(mapped);
      } else {
        buckets.set(key, [mapped]);
      }
    }
  }

  const orderedKeys: string[] = [];
  for (const key of order) {
    if (allKeys.has(key)) {
      orderedKeys.push(key);
      allKeys.delete(key);
    }
  }
  for (const key of allKeys) {
    orderedKeys.push(key);
  }

  return orderedKeys.flatMap((key) => {
    const bucket = buckets.get(key);
    return bucket ? [{ group: { id: key, slug: "", name: key }, items: bucket }] : [];
  });
}

function buildGroups(
  items: CardViewerItem[],
  groupBy: GroupByField,
  setOrder: GroupInfo[] | undefined,
  groupDir: "asc" | "desc",
  orders: EnumOrders,
): CardGroup[] {
  if (groupBy === "none") {
    return [{ group: { id: "_all", slug: "", name: "" }, items }];
  }
  if (groupBy === "channel") {
    return groupItemsByChannel(items, groupDir);
  }
  if (groupBy === "year") {
    return groupItemsByYear(items, groupDir);
  }
  if (groupBy === "marker") {
    return groupItemsByMarker(items, groupDir);
  }
  let groups: CardGroup[];
  if (groupBy === "set") {
    groups = setOrder
      ? groupItemsBySet(items, setOrder)
      : [{ group: { id: "_all", slug: "", name: "" }, items }];
  } else {
    groups = groupItemsByField(items, groupBy, orders);
  }
  if (groupDir === "desc") {
    groups = groups.toReversed();
  }
  return groups;
}

function buildVirtualRows(groups: CardGroup[]): VRow[] {
  const showHeaders = groups.length > 1;
  const rows: VRow[] = [];
  let cardsBefore = 0;
  for (const group of groups) {
    if (showHeaders) {
      rows.push({ kind: "header", group: group.group, cardCount: group.items.length });
    }
    for (const item of group.items) {
      rows.push({ kind: "cards", items: [item], cardsBefore });
      cardsBefore += 1;
    }
  }
  return rows;
}

// Each row reads its own count via a printingId-scoped live query so
// add/remove only re-renders the affected row. Action handlers are read
// from the registry via getState() at click time — no React subscription,
// no re-render trigger when the parent re-registers.
//
// `renderActions` is a deliberate exception: it captures parent state
// (e.g. shift-held / per-card deck quantities in the deck builder) and
// must update with the parent. Threading it as a prop bails the memo on
// every parent render — acceptable because the heavy per-row work
// (useOwnedCountFor) is hook-driven and unaffected by identity churn.
const DataRow = memo(function DataRow({
  printing,
  isSelected,
  showOwned,
  showAddControls,
  columns,
  cardTypeLabels,
  superTypeLabels,
  rarityLabels,
  setNameBySlug,
  renderActions,
}: {
  printing: Printing;
  isSelected: boolean;
  showOwned: boolean;
  showAddControls: boolean;
  columns: string;
  cardTypeLabels: Record<string, string>;
  superTypeLabels: Record<string, string>;
  rarityLabels: Record<string, string>;
  setNameBySlug: Map<string, string>;
  renderActions?: (printing: Printing, ownedCount: number | undefined) => ReactNode;
}) {
  const { data: ownedCount } = useOwnedCountFor(printing.id, showOwned || showAddControls);
  return (
    <CardTableRow
      printing={printing}
      ownedCount={ownedCount}
      isSelected={isSelected}
      showOwned={showOwned}
      showAddControls={showAddControls}
      columns={columns}
      cardTypeLabels={cardTypeLabels}
      superTypeLabels={superTypeLabels}
      rarityLabels={rarityLabels}
      setNameBySlug={setNameBySlug}
      onRowClick={(p) => useCardRowActionsStore.getState().handlers.onRowClick?.(p)}
      onIncrement={(p, modifiers) =>
        useCardRowActionsStore.getState().handlers.onIncrement?.(p, modifiers)
      }
      onDecrement={(p, anchor, modifiers) =>
        useCardRowActionsStore.getState().handlers.onDecrement?.(p, anchor, modifiers)
      }
      renderActions={renderActions}
    />
  );
});

interface CardTableProps {
  items: CardViewerItem[];
  totalItems: number;
  setOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
  selectedItemId?: string;
  /** Window-scroll offset for sticky elements above the table (header + toolbar). */
  stickyOffset?: number;
  showOwned: boolean;
  showAddControls: boolean;
  /** Optional renderer for the actions cell; replaces the default +/- buttons. */
  renderActions?: (printing: Printing, ownedCount: number | undefined) => ReactNode;
}

let cachedScrollMargin = 0;

/**
 * Virtualized table view for the card browser. Mirrors CardGrid's grouping +
 * window-scroll virtualization but renders rows instead of grid cells. Each
 * row hovers a full-size preview via HoverCard, and the rightmost column
 * surfaces owned counts plus +/- buttons in add mode.
 *
 * @returns The rendered virtualized table.
 */
export function CardTable({
  items,
  totalItems,
  setOrder,
  groupBy = "set",
  groupDir = "asc",
  selectedItemId,
  stickyOffset = getHeaderHeight(),
  showOwned,
  showAddControls,
  renderActions,
}: CardTableProps) {
  const { orders, labels } = useEnumOrders();

  const containerRef = useRef<HTMLDivElement>(null);

  const groups = buildGroups(items, groupBy, setOrder, groupDir, orders);
  const multipleGroups = groups.length > 1;
  const virtualRows = buildVirtualRows(groups);
  const setNameBySlug = new Map((setOrder ?? []).map((info) => [info.slug, info.name]));

  const estimateRowHeight = (index: number): number => {
    const row = virtualRows[index];
    if (!row) {
      return CARD_TABLE_ROW_HEIGHT;
    }
    return row.kind === "header" ? CARD_TABLE_HEADER_HEIGHT : CARD_TABLE_ROW_HEIGHT;
  };

  const [scrollMargin, setScrollMargin] = useState(() => cachedScrollMargin);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().top + globalThis.scrollY);
      cachedScrollMargin = next;
      setScrollMargin((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const { virtualizer, virtualItems, totalSize } = useWindowVirtualizerFresh({
    count: virtualRows.length,
    estimateSize: estimateRowHeight,
    gap: GAP,
    scrollMargin,
    scrollPaddingStart: stickyOffset,
    overscan: 8,
  });

  const virtualizerRef = useRef(virtualizer);
  const virtualRowsRef = useRef(virtualRows);
  const stickyOffsetRef = useRef(stickyOffset);
  useEffect(() => {
    virtualizerRef.current = virtualizer;
    virtualRowsRef.current = virtualRows;
    stickyOffsetRef.current = stickyOffset;
  });

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }
    const rows = virtualRowsRef.current;
    const rowIndex = rows.findIndex(
      (row) =>
        row.kind === "cards" &&
        row.items.some((item) => item.id === selectedItemId || item.printing.id === selectedItemId),
    );
    if (rowIndex === -1) {
      return;
    }
    const vItems = virtualizerRef.current.getVirtualItems();
    const vItem = vItems.find((vi) => vi.index === rowIndex);
    if (vItem) {
      const viewportTop = globalThis.scrollY + stickyOffsetRef.current;
      const viewportBottom = globalThis.scrollY + globalThis.innerHeight;
      if (vItem.start >= viewportTop && vItem.start + vItem.size <= viewportBottom) {
        return;
      }
    }
    virtualizerRef.current.scrollToIndex(rowIndex, { align: "start" });
  }, [selectedItemId]);

  const scrollToGroup = (groupId: string) => {
    const rowIndex = virtualRows.findIndex(
      (row) => row.kind === "header" && row.group.id === groupId,
    );
    if (rowIndex !== -1) {
      virtualizerRef.current.scrollToIndex(rowIndex, { align: "start", behavior: "auto" });
    }
  };

  const columns = getCardTableColumns(showOwned, showAddControls);

  if (items.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-1 flex-col">
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 text-center">
          {totalItems === 0 ? (
            <>
              <WifiOffIcon className="size-10 opacity-50" />
              <p>Couldn&apos;t load cards</p>
              <p className="text-xs">The server may be unreachable.</p>
              <button
                type="button"
                className="mt-1 text-sm underline"
                onClick={() => globalThis.location.reload()}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <SearchXIcon className="size-10 opacity-50" />
              <p>No cards found</p>
              <p className="text-xs">Try adjusting your filters.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <CardTableHeader
        columns={columns}
        showOwned={showOwned}
        showAddControls={showAddControls}
        sticky
        stickyOffset={stickyOffset}
        bordered={!multipleGroups}
      />
      <div style={{ height: `${totalSize}px`, position: "relative" }}>
        {virtualItems.map((vItem) => {
          const row = virtualRows[vItem.index];
          if (!row) {
            return null;
          }
          return (
            <div
              key={vItem.key}
              data-index={vItem.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vItem.start - scrollMargin}px)`,
              }}
            >
              {row.kind === "header" ? (
                multipleGroups ? (
                  <CardTableGroupHeader
                    columns={columns}
                    slug={row.group.slug}
                    name={row.group.name}
                    count={row.cardCount}
                    onClick={() => scrollToGroup(row.group.id)}
                  />
                ) : null
              ) : (
                row.items.map((item) => (
                  <DataRow
                    key={item.id}
                    printing={item.printing}
                    isSelected={item.id === selectedItemId || item.printing.id === selectedItemId}
                    showOwned={showOwned}
                    showAddControls={showAddControls}
                    columns={columns}
                    cardTypeLabels={labels.cardTypes}
                    superTypeLabels={labels.superTypes}
                    rarityLabels={labels.rarities}
                    setNameBySlug={setNameBySlug}
                    renderActions={renderActions}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
