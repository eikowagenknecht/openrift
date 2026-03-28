import type { Printing } from "@openrift/shared";
import type { ReactNode } from "react";

import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { CardGrid } from "@/components/cards/card-grid";
import type { SetInfo } from "@/components/cards/card-grid-types";
import { cn } from "@/lib/utils";

interface CardViewerProps {
  items: CardViewerItem[];
  totalItems: number;
  renderCard: (item: CardViewerItem, ctx: CardRenderContext) => ReactNode;
  setOrder?: SetInfo[];
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
  selectedItemId,
  keyboardNavItemId,
  onItemClick,
  siblingPrintings,
  stale,
  toolbar,
  leftPane,
  aboveGrid,
  rightPane,
  children,
}: CardViewerProps) {
  return (
    <div>
      {toolbar}
      <div className="mt-4 flex items-start gap-6">
        {leftPane}
        <div
          className={cn(
            "min-w-0 flex-1 transition-opacity duration-150",
            stale ? "opacity-60" : "opacity-100",
          )}
        >
          {aboveGrid}
          <CardGrid
            items={items}
            totalItems={totalItems}
            renderCard={renderCard}
            setOrder={setOrder}
            selectedItemId={selectedItemId}
            keyboardNavItemId={keyboardNavItemId}
            onItemClick={onItemClick}
            siblingPrintings={siblingPrintings}
          />
        </div>
        {rightPane}
      </div>
      {children}
    </div>
  );
}
