import type { GroupByField, Printing } from "@openrift/shared";
import type { ReactElement, ReactNode } from "react";

import { CardBrowserLayout, useCardBrowserLayoutOffsets } from "@/components/card-browser-layout";
import { CardGrid } from "@/components/cards/card-grid";
import { CardTable } from "@/components/cards/card-table";
import type { TableRowSlotProps } from "@/components/cards/card-table";
import { useGridKeyboardNav } from "@/components/cards/use-grid-keyboard-nav";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { GroupInfo } from "@/lib/card-group-types";
import type { CardRenderContext, CardViewerItem } from "@/lib/card-viewer-types";
import type { ActionsColumn } from "@/lib/collection-table";
import { useDisplayStore } from "@/stores/display-store";

export interface CardTableProps {
  actionsColumn: ActionsColumn;
  actionsCell?: ReactElement<TableRowSlotProps>;
  actionsLabel?: string;
  rowWrapper?: ReactElement<TableRowSlotProps & { children?: ReactNode }>;
}

interface CardViewerProps {
  items: CardViewerItem[];
  totalItems: number;
  renderCard: (item: CardViewerItem, ctx: CardRenderContext) => ReactNode;
  setOrder?: GroupInfo[];
  collectionOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
  selectedItemId?: string;
  siblingPrintings?: Printing[];
  stale?: boolean;
  toolbar?: ReactNode;
  leftPane?: ReactNode;
  aboveGrid?: ReactNode;
  banner?: ReactNode;
  rightPane?: ReactNode;
  addStripHeight?: number;
  table?: CardTableProps;
  noResultsDescription?: ReactNode;
  children?: ReactNode;
}

/**
 * Outer structure (sticky offsets, slots) lives in {@link CardBrowserLayout};
 * this owns the grid logic and the hydration toggle between the live
 * `CardGrid`/`CardTable` and the SSR-time skeleton.
 */
export function CardViewer({
  items,
  totalItems,
  renderCard,
  setOrder,
  collectionOrder,
  groupBy,
  groupDir,
  selectedItemId,
  siblingPrintings,
  stale,
  toolbar,
  leftPane,
  aboveGrid,
  banner,
  rightPane,
  addStripHeight,
  table,
  noResultsDescription,
  children,
}: CardViewerProps) {
  const displayMode = useDisplayStore((state) => state.displayMode);
  const isMobile = useIsMobile();
  const useTable = !isMobile && displayMode === "table" && table !== undefined;

  useGridKeyboardNav({ items, siblingPrintings });

  // No useHydrated() gate: every consumer already mounts post-hydration, so
  // an SSR-skeleton fallback here would only ever flash for one frame.
  return (
    <CardBrowserLayout
      toolbar={toolbar}
      leftPane={leftPane}
      aboveGrid={aboveGrid}
      banner={banner}
      rightPane={rightPane}
      stale={stale}
      gridSlot={
        useTable ? (
          <HydratedTable
            items={items}
            totalItems={totalItems}
            setOrder={setOrder}
            collectionOrder={collectionOrder}
            groupBy={groupBy}
            groupDir={groupDir}
            selectedItemId={selectedItemId}
            table={table}
            noResultsDescription={noResultsDescription}
          />
        ) : (
          <HydratedGrid
            items={items}
            totalItems={totalItems}
            renderCard={renderCard}
            setOrder={setOrder}
            collectionOrder={collectionOrder}
            groupBy={groupBy}
            groupDir={groupDir}
            selectedItemId={selectedItemId}
            addStripHeight={addStripHeight}
            noResultsDescription={noResultsDescription}
          />
        )
      }
    >
      {children}
    </CardBrowserLayout>
  );
}

type HydratedGridProps = Pick<
  CardViewerProps,
  | "items"
  | "totalItems"
  | "renderCard"
  | "setOrder"
  | "collectionOrder"
  | "groupBy"
  | "groupDir"
  | "selectedItemId"
  | "addStripHeight"
  | "noResultsDescription"
>;

function HydratedGrid(props: HydratedGridProps) {
  const { stickyOffset } = useCardBrowserLayoutOffsets();
  return <CardGrid {...props} stickyOffset={stickyOffset} />;
}

interface HydratedTableProps {
  items: CardViewerItem[];
  totalItems: number;
  setOrder?: GroupInfo[];
  collectionOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
  selectedItemId?: string;
  table: CardTableProps;
  noResultsDescription?: ReactNode;
}

function HydratedTable({ table, ...props }: HydratedTableProps) {
  const { stickyOffset } = useCardBrowserLayoutOffsets();
  return <CardTable {...props} {...table} stickyOffset={stickyOffset} />;
}
