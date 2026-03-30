import type { GroupByField, Printing } from "@openrift/shared";
import type { ReactNode } from "react";

import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { CardGrid } from "@/components/cards/card-grid";
import type { GroupInfo } from "@/components/cards/card-grid-types";
import { cn } from "@/lib/utils";

interface CardViewerProps {
  items: CardViewerItem[];
  totalItems: number;
  renderCard: (item: CardViewerItem, ctx: CardRenderContext) => ReactNode;
  setOrder?: GroupInfo[];
  groupBy?: GroupByField;
  printingsByCardId?: Map<string, Printing[]>;
  selectedItemId?: string;
  keyboardNavItemId?: string;
  onItemClick?: (printing: Printing) => void;
  siblingPrintings?: Printing[];

  /** When true, dims the grid during deferred updates. */
  stale?: boolean;

  toolbar?: ReactNode;
  leftPane?: ReactNode;
  /** Content rendered above the grid inside the center column. */
  aboveGrid?: ReactNode;
  rightPane?: ReactNode;
  /** Extra height added to each card row (e.g. add-mode strip). */
  addStripHeight?: number;
  children?: ReactNode;
}

/**
 * Shared layout shell used by both the card browser and the collection grid.
 * Renders a toolbar, an optional three-pane layout, and a virtualized CardGrid.
 * @returns The card viewer layout.
 */
export function CardViewer({
  items,
  totalItems,
  renderCard,
  setOrder,
  groupBy,
  printingsByCardId,
  selectedItemId,
  keyboardNavItemId,
  onItemClick,
  siblingPrintings,
  stale,
  toolbar,
  leftPane,
  aboveGrid,
  rightPane,
  addStripHeight,
  children,
}: CardViewerProps) {
  return (
    <div className="@container flex flex-1 flex-col">
      {toolbar}
      <div className="mt-4 flex flex-1 items-stretch gap-6">
        {leftPane}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col transition-opacity duration-150",
            stale ? "opacity-60" : "opacity-100",
          )}
        >
          {aboveGrid}
          <CardGrid
            items={items}
            totalItems={totalItems}
            renderCard={renderCard}
            setOrder={setOrder}
            groupBy={groupBy}
            printingsByCardId={printingsByCardId}
            selectedItemId={selectedItemId}
            keyboardNavItemId={keyboardNavItemId}
            onItemClick={onItemClick}
            siblingPrintings={siblingPrintings}
            addStripHeight={addStripHeight}
          />
        </div>
        {rightPane}
      </div>
      {children}
    </div>
  );
}
