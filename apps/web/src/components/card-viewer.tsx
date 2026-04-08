import type { GroupByField, Printing } from "@openrift/shared";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { CardGrid } from "@/components/cards/card-grid";
import { APP_HEADER_HEIGHT } from "@/components/cards/card-grid-constants";
import type { GroupInfo } from "@/components/cards/card-grid-types";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

interface CardViewerProps {
  items: CardViewerItem[];
  totalItems: number;
  renderCard: (item: CardViewerItem, ctx: CardRenderContext) => ReactNode;
  setOrder?: GroupInfo[];
  groupBy?: GroupByField;
  groupDir?: "asc" | "desc";
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
  groupDir,
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
  const hydrated = useHydrated();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);

  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
      setToolbarHeight(Math.round(height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stickyOffset = APP_HEADER_HEIGHT + toolbarHeight;

  return (
    <div className="@container flex flex-1 flex-col">
      <div
        ref={toolbarRef}
        className="bg-background/80 sticky z-20 -mx-3 px-3 pt-3 pb-1 backdrop-blur-lg sm:rounded-b-xl"
        style={{ top: APP_HEADER_HEIGHT }}
      >
        {toolbar}
      </div>
      <div
        className="relative flex flex-1 items-stretch gap-6"
        style={{ "--sticky-top": `${stickyOffset}px` } as React.CSSProperties}
      >
        {leftPane}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col transition-opacity duration-150",
            stale ? "opacity-60" : "opacity-100",
          )}
        >
          {aboveGrid}
          {hydrated ? (
            <CardGrid
              items={items}
              totalItems={totalItems}
              renderCard={renderCard}
              setOrder={setOrder}
              groupBy={groupBy}
              groupDir={groupDir}
              selectedItemId={selectedItemId}
              keyboardNavItemId={keyboardNavItemId}
              onItemClick={onItemClick}
              siblingPrintings={siblingPrintings}
              addStripHeight={addStripHeight}
              stickyOffset={stickyOffset}
            />
          ) : (
            <CardGridSkeleton />
          )}
        </div>
        {rightPane}
      </div>
      {children}
    </div>
  );
}

/**
 * Placeholder grid shown during SSR while the virtualizer is not yet mounted.
 *
 * @returns A CSS grid of animated placeholder cards.
 */
function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
      {Array.from({ length: 20 }, (_, i) => (
        <div key={i} className="bg-muted aspect-card animate-pulse rounded-lg" />
      ))}
    </div>
  );
}
