import type { GroupByField, Printing } from "@openrift/shared";
import type { ReactElement, ReactNode } from "react";

import { CardBrowserLayout, useCardBrowserLayoutOffsets } from "@/components/card-browser-layout";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { CardGrid } from "@/components/cards/card-grid";
import type { GroupInfo } from "@/components/cards/card-grid-types";
import { CardTable } from "@/components/cards/card-table";
import type { TableRowSlotProps } from "@/components/cards/card-table";
import type { ActionsColumn } from "@/components/cards/card-table-row";
import { useGridKeyboardNav } from "@/components/cards/use-grid-keyboard-nav";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useDisplayStore } from "@/stores/display-store";

export interface CardTableProps {
  /** Width + presence of the rightmost actions column. "none" omits the column entirely. */
  actionsColumn: ActionsColumn;
  /**
   * JSX element rendered inside each row's actions cell. Per-row data
   * (`printing`, `itemId`) is injected via cloneElement, so the actions
   * component should declare those as optional props.
   */
  actionsCell?: ReactElement<TableRowSlotProps>;
  /** Label for the rightmost column header. Defaults to "Owned". */
  actionsLabel?: string;
  /**
   * Optional wrapper element applied around each data row. Mirrors the grid's
   * per-cell `wrap` slot — surfaces use this for drag wiring (e.g. /collections
   * wraps rows in `<DraggableCard>` so table rows are draggable just like grid
   * cells). Per-row data is injected via cloneElement and the row node is
   * provided as children.
   */
  rowWrapper?: ReactElement<TableRowSlotProps & { children?: ReactNode }>;
}

interface CardViewerProps {
  items: CardViewerItem[];
  totalItems: number;
  renderCard: (item: CardViewerItem, ctx: CardRenderContext) => ReactNode;
  setOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
  selectedItemId?: string;
  siblingPrintings?: Printing[];

  /** When true, dims the grid during deferred updates. */
  stale?: boolean;

  toolbar?: ReactNode;
  leftPane?: ReactNode;
  /** Content rendered above the grid + rightPane columns. */
  aboveGrid?: ReactNode;
  /** Non-sticky content between the above-grid tier and the grid (scrolls away). */
  banner?: ReactNode;
  rightPane?: ReactNode;
  /** Extra height added to each card row (e.g. add-mode strip). */
  addStripHeight?: number;
  /** Owned counts + click + add-mode handlers used by the table view. When omitted, table view falls back to the grid. */
  table?: CardTableProps;
  children?: ReactNode;
}

/**
 * Shared layout shell used by both the card browser and the collection grid.
 * Renders a toolbar, an optional three-pane layout, and a virtualized CardGrid
 * or CardTable depending on the user's `displayMode` preference.
 *
 * Outer structure (sticky offsets, slots) lives in {@link CardBrowserLayout};
 * this component owns the grid logic — items, render context, and the
 * hydration toggle between the live `CardGrid` and the SSR-time skeleton.
 * @returns The card viewer layout.
 */
export function CardViewer({
  items,
  totalItems,
  renderCard,
  setOrder,
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
  children,
}: CardViewerProps) {
  const displayMode = useDisplayStore((state) => state.displayMode);
  const isMobile = useIsMobile();
  const useTable = !isMobile && displayMode === "table" && table !== undefined;

  useGridKeyboardNav({ items, siblingPrintings });

  // No useHydrated() gate here: every CardViewer consumer (CardBrowser,
  // deck-card-browser, collection-grid via BrowserCardViewer) only mounts
  // post-hydration, so the previous SSR-skeleton fallback only ever rendered
  // for one frame on initial mount due to useSyncExternalStore returning the
  // server snapshot first — producing a visible flash between FirstRowPreview
  // and the live grid.
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
            groupBy={groupBy}
            groupDir={groupDir}
            selectedItemId={selectedItemId}
            table={table}
          />
        ) : (
          <HydratedGrid
            items={items}
            totalItems={totalItems}
            renderCard={renderCard}
            setOrder={setOrder}
            groupBy={groupBy}
            groupDir={groupDir}
            selectedItemId={selectedItemId}
            addStripHeight={addStripHeight}
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
  | "groupBy"
  | "groupDir"
  | "selectedItemId"
  | "addStripHeight"
>;

/**
 * Reads the layout's sticky offset from context and forwards it to CardGrid.
 *
 * @returns The hydrated CardGrid wired up with the surrounding sticky offset.
 */
function HydratedGrid(props: HydratedGridProps) {
  const { stickyOffset } = useCardBrowserLayoutOffsets();
  return <CardGrid {...props} stickyOffset={stickyOffset} />;
}

interface HydratedTableProps {
  items: CardViewerItem[];
  totalItems: number;
  setOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
  selectedItemId?: string;
  table: CardTableProps;
}

/**
 * Reads the layout's sticky offset from context and forwards it to CardTable.
 *
 * @returns The hydrated CardTable wired up with the surrounding sticky offset.
 */
function HydratedTable({ table, ...props }: HydratedTableProps) {
  const { stickyOffset } = useCardBrowserLayoutOffsets();
  return <CardTable {...props} {...table} stickyOffset={stickyOffset} />;
}
