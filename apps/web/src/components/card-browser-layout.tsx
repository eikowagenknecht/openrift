import type { ReactNode } from "react";
import { createContext, use, useLayoutEffect, useRef, useState } from "react";

import { usePageTopBarHeight } from "@/components/layout/page-top-bar";
import { useHeaderHeight } from "@/hooks/use-header-height";
import { STICKY_SURFACE } from "@/lib/sticky-surface";
import { cn } from "@/lib/utils";

interface CardBrowserLayoutOffsets {
  toolbarOffset: number;
  stickyOffset: number;
}

const CardBrowserLayoutContext = createContext<CardBrowserLayoutOffsets>({
  toolbarOffset: 0,
  stickyOffset: 0,
});

/**
 * Safe in inline styles during hydration only while this and the surrounding
 * {@link CardBrowserLayout} hydrate together; a `<Suspense>` between them
 * would read live offsets against pre-measurement server markup.
 */
export function useCardBrowserLayoutOffsets(): CardBrowserLayoutOffsets {
  return use(CardBrowserLayoutContext);
}

interface CardBrowserLayoutProps {
  toolbar?: ReactNode;
  leftPane?: ReactNode;
  aboveGrid?: ReactNode;
  banner?: ReactNode;
  rightPane?: ReactNode;
  stale?: boolean;
  gridSlot?: ReactNode;
  children?: ReactNode;
}

/**
 * Shared shell for both the live `<CardBrowser>` and the SSR `<FirstRowPreview>`,
 * so both render through one structural source and can't drift apart.
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
  const pageTopBarHeight = usePageTopBarHeight();
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

  // -1 tucks the tier chain under the z-50 header, closing the 1px seam that
  // fractional browser zoom opens between independently-snapping sticky layers.
  const headerOffset = useHeaderHeight() + pageTopBarHeight - 1;
  const toolbarOffset = headerOffset + toolbarHeight;
  const stickyOffset = toolbarOffset + aboveGridHeight;

  return (
    <CardBrowserLayoutContext value={{ toolbarOffset, stickyOffset }}>
      <div className="@container flex flex-1 flex-col">
        <div
          ref={toolbarRef}
          className={cn(
            // z-30, co-planar with the page top bar: at z-20 the bar's own bg
            // painted over and clipped a focused control's outset ring. See
            // the sticky z-ladder note in CLAUDE.md.
            STICKY_SURFACE,
            "mx-safe-neg px-safe sticky z-30",
            // Only the first tier under the header gets top padding; a page
            // top bar above already provides the gap via its own pb-3.
            pageTopBarHeight === 0 && "-mt-px pt-3",
            aboveGridHeight === 0 && "sm:rounded-b-lg",
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
              className={cn(STICKY_SURFACE, "mx-safe-neg px-safe sticky z-15 sm:rounded-b-lg")}
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
