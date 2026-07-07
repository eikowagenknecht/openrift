import type { ReactNode } from "react";
import { createContext, use, useLayoutEffect, useRef, useState } from "react";

import { PageTopBarHeightContext } from "@/components/layout/page-top-bar";
import { useHeaderHeight } from "@/hooks/use-header-height";
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
  /** Content rendered above the grid + rightPane columns (e.g. ActiveFilters). */
  aboveGrid?: ReactNode;
  /**
   * Non-sticky content between the above-grid tier and the grid (e.g. an
   * onboarding intro). Unlike `aboveGrid` it scrolls away with the page.
   */
  banner?: ReactNode;
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
  banner,
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

  const headerOffset = useHeaderHeight() + pageTopBarHeight;
  const toolbarOffset = headerOffset + toolbarHeight;
  const stickyOffset = toolbarOffset + aboveGridHeight;

  return (
    <CardBrowserLayoutContext value={{ toolbarOffset, stickyOffset }}>
      <div className="@container flex flex-1 flex-col">
        <div
          ref={toolbarRef}
          className={cn(
            // z-30 (co-planar with the page top bar, not below it): the toolbar
            // sits flush under the bar with no top padding, so a focused
            // control's 3px outset ring pokes up into the bar's pb gap. At
            // z-20 the bar's blurred bg painted over that strip and clipped the
            // ring; co-planar lets the ring win the overlap. The bar has no
            // bottom border, so its edge is covered invisibly in any real
            // overlap. See the sticky z-ladder note in CLAUDE.md.
            "bg-background/80 mx-safe-neg px-safe sticky z-30 backdrop-blur-lg",
            // Only pad the top when this toolbar is the first tier under the
            // global header. When a page top bar sits above it, that bar's
            // pb-3 already provides the gap (avoids a doubled 24px band).
            pageTopBarHeight === 0 && "pt-3",
            aboveGridHeight === 0 && "sm:rounded-b-xl",
          )}
          style={{ top: headerOffset }}
        >
          {toolbar}
        </div>
        <div
          className="relative flex flex-1 items-stretch gap-6"
          style={{ "--sticky-top": `${stickyOffset}px` } as React.CSSProperties}
        >
          {leftPane}
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={aboveGridRef}
              className="bg-background/80 mx-safe-neg px-safe sticky z-15 backdrop-blur-lg sm:rounded-b-xl"
              style={{ top: toolbarOffset }}
            >
              {aboveGrid}
            </div>
            {banner}
            <div className="relative flex flex-1 items-stretch gap-6">
              <div
                className={cn(
                  "@container/grid flex min-w-0 flex-1 flex-col transition-opacity duration-150",
                  stale ? "opacity-60" : "opacity-100",
                )}
              >
                {gridSlot}
              </div>
              {rightPane}
            </div>
          </div>
        </div>
        {children}
      </div>
    </CardBrowserLayoutContext>
  );
}
