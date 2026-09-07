import type { CSSProperties, ReactNode, Ref } from "react";
import { useState } from "react";

import {
  PAGE_TOP_BAR_STICKY,
  PageTopBarHeightContext,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { useHeaderHeight } from "@/hooks/use-header-height";
import { cn } from "@/lib/utils";

interface BuilderWorkbenchProps {
  topBar: ReactNode;
  aside: ReactNode;
  asideClassName?: string;
  columnsRef?: Ref<HTMLDivElement>;
  overlay?: ReactNode;
  children: ReactNode;
}

/**
 * The aside is the sticky, inner-scrolled column; the browser (children) is
 * window-scrolled because its virtualizer reads the window scroller.
 */
export function BuilderWorkbench({
  topBar,
  aside,
  asideClassName,
  columnsRef,
  overlay,
  children,
}: BuilderWorkbenchProps) {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);
  const headerHeight = useHeaderHeight();

  // -1 mirrors PAGE_TOP_BAR_STICKY's own -1px pin, so the aside catches at the bar's bottom edge.
  const stickyTop = headerHeight + topBarHeight - 1;

  return (
    <PageTopBarHeightContext value={topBarHeight}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY}>
          {topBar}
        </div>

        <div
          ref={columnsRef}
          className="px-safe relative flex flex-1 flex-col gap-4 px-3 lg:flex-row"
        >
          {overlay}
          <div className={cn("w-full shrink-0", asideClassName)}>
            {/* overflow-y implies overflow-x auto, clipping an inset ring; the
                padding+margin restore it, overflow-x-hidden then stops a Switch's wide hit area from shifting the box. */}
            <div
              className="-mx-1 px-1 pt-3 lg:sticky lg:max-h-[calc(100dvh_-_var(--workbench-aside-top))] lg:overflow-x-hidden lg:overflow-y-auto"
              style={{ top: stickyTop, "--workbench-aside-top": `${stickyTop}px` } as CSSProperties}
            >
              {aside}
            </div>
          </div>
          {children}
        </div>
      </div>
    </PageTopBarHeightContext>
  );
}
