import type { ReactNode } from "react";
import { createContext, use, useLayoutEffect, useRef, useState } from "react";

import { APP_HEADER_HEIGHT } from "@/components/cards/card-grid-constants";
import { PageTopBarHeightContext } from "@/components/layout/page-top-bar";
import { cn } from "@/lib/utils";

interface CardBrowserLayoutOffsets {
  /** Top offset for content sticking to the bottom of the toolbar row. */
  toolbarOffset: number;
  /** Top offset for content sticking to the bottom of the above-grid row (e.g. group headers inside CardGrid). */
  stickyOffset: number;
}

const CardBrowserLayoutContext = createContext<CardBrowserLayoutOffsets>({
  toolbarOffset: 0,
  stickyOffset: 0,
});

/**
 * Reads sticky offsets computed by the surrounding {@link CardBrowserLayout}.
 * Call from inside the layout's `gridSlot` to size group-header sticky positions.
 *
 * @returns Toolbar and grid sticky-top offsets in pixels.
 */
export function useCardBrowserLayoutOffsets(): CardBrowserLayoutOffsets {
  return use(CardBrowserLayoutContext);
}

interface CardBrowserLayoutProps {
  toolbar?: ReactNode;
  leftPane?: ReactNode;
  /** Content rendered above the grid inside the center column (e.g. ActiveFilters). */
  aboveGrid?: ReactNode;
  rightPane?: ReactNode;
  /** When true, dims the grid area during deferred updates. */
  stale?: boolean;
  /** The grid area itself — CardGrid, a skeleton, or an SSR preview. */
  gridSlot?: ReactNode;
  /** Extra elements rendered after the flex row (overlays, portal mounts). */
  children?: ReactNode;
}

/**
 * Shared outer shell for the card browser surfaces (live `<CardBrowser>` and
 * the SSR `<FirstRowPreview>`). Owns the `@container` wrapper, the sticky
 * toolbar row, and the three-column flex layout (leftPane / center / rightPane)
 * so both paths render through a single structural source — preventing the
 * SSR-shell vs hydrated-shell layout drift the page used to suffer from.
 *
 * Sticky offsets for grouped headers are derived here via ResizeObservers and
 * exposed through {@link useCardBrowserLayoutOffsets}.
 *
 * @returns The card browser layout shell.
 */
export function CardBrowserLayout({
  toolbar,
  leftPane,
  aboveGrid,
  rightPane,
  stale,
  gridSlot,
  children,
}: CardBrowserLayoutProps) {
  const pageTopBarHeight = use(PageTopBarHeightContext);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const aboveGridRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const [aboveGridHeight, setAboveGridHeight] = useState(0);

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

  useLayoutEffect(() => {
    const el = aboveGridRef.current;
    if (!el) {
      setAboveGridHeight(0);
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
      setAboveGridHeight(Math.round(height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const headerOffset = APP_HEADER_HEIGHT + pageTopBarHeight;
  const toolbarOffset = headerOffset + toolbarHeight;
  const stickyOffset = toolbarOffset + aboveGridHeight;

  return (
    <CardBrowserLayoutContext value={{ toolbarOffset, stickyOffset }}>
      <div className="@container flex flex-1 flex-col">
        <div
          ref={toolbarRef}
          className={cn(
            "bg-background/80 sticky z-20 -mx-3 px-3 pt-3 backdrop-blur-lg",
            aboveGridHeight === 0 && "sm:rounded-b-xl",
          )}
          style={{ top: headerOffset }}
        >
          {toolbar}
        </div>
        <div
          className="relative flex flex-1 items-stretch gap-6"
          style={{ "--sticky-top": `${toolbarOffset}px` } as React.CSSProperties}
        >
          {leftPane}
          <div
            className={cn(
              "@container/grid flex min-w-0 flex-1 flex-col transition-opacity duration-150",
              stale ? "opacity-60" : "opacity-100",
            )}
          >
            <div
              ref={aboveGridRef}
              className="bg-background/80 sticky z-15 -mx-3 px-3 backdrop-blur-lg sm:rounded-b-xl"
              style={{ top: toolbarOffset }}
            >
              {aboveGrid}
            </div>
            {gridSlot}
          </div>
          {rightPane}
        </div>
        {children}
      </div>
    </CardBrowserLayoutContext>
  );
}
