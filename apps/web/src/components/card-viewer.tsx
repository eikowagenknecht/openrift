import type { GroupByField, Printing } from "@openrift/shared";
import type { ReactNode } from "react";

import { CardBrowserLayout, useCardBrowserLayoutOffsets } from "@/components/card-browser-layout";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { CardGrid } from "@/components/cards/card-grid";
import type { GroupInfo } from "@/components/cards/card-grid-types";

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
      rightPane={rightPane}
      stale={stale}
      gridSlot={
        <HydratedGrid
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
        />
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
  | "keyboardNavItemId"
  | "onItemClick"
  | "siblingPrintings"
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
