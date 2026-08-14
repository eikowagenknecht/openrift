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
  /** The page top bar's contents, hosted in the measured sticky slot. */
  topBar: ReactNode;
  /**
   * The sticky, inner-scrolled column: the tier board, the presentation queue.
   * Stacks above the browser below `lg`.
   */
  aside: ReactNode;
  /** Width utilities for the aside column at `lg`. */
  asideClassName?: string;
  /** Ref on the two-column row, for an overlay anchored to it. */
  columnsRef?: Ref<HTMLDivElement>;
  /** Rendered inside the two-column row, before the columns. */
  overlay?: ReactNode;
  /** The main column: a card browser. */
  children: ReactNode;
}

/**
 * The shell every creator builder is laid out in: a measured sticky page top
 * bar, then two columns with a card browser on the right and the thing being
 * built on the left.
 *
 * **The aside is the sticky, inner-scrolled column and the browser is the
 * window-scrolled one, not the other way round.** The browser is a virtualized
 * grid whose virtualizer reads the *window* scroller, so putting it in an inner
 * scroll container renders it empty. What the aside holds is bounded (a dozen
 * board rows, a queue of at most 120 stops), so it takes the inner scroll and
 * stays in view while the creator works through a set.
 *
 * Two pieces of sticky arithmetic live here rather than at the call sites,
 * because getting either wrong is a visible defect and both surfaces had
 * already drifted apart on them:
 *
 * - The `-1` on the aside's offset mirrors `PAGE_TOP_BAR_STICKY`'s own `-1px`
 *   pin, so the aside catches exactly at the bar's bottom edge instead of a
 *   pixel below it.
 * - The `pt-3` sits *inside* the sticky box, so the aside clears the bar's
 *   frosted band without moving the box's flow position off its pin (padding on
 *   the row would push it 12px down, and the aside would travel on the first
 *   scroll before catching). The main column deliberately gets no such padding:
 *   a card-browser toolbar is itself a blurred control band and belongs flush
 *   under the bar (see CLAUDE.md).
 *
 * @returns The workbench node.
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
            {/* The max height is lg-only: below that the aside is a plain block
                in the page flow with nothing to scroll.

                `-mx-1 px-1`: setting `overflow-y` computes `overflow-x` to
                `auto` too, so the box clips at its content edge and shaves the
                outset ring off whatever is inside (the tier rows' `ring-1`, a
                focused control's 2px ring). The padding gives the ring room and
                the negative margin pulls the column back to where it was, so
                nothing moves. */}
            <div
              className="-mx-1 px-1 pt-3 lg:sticky lg:max-h-[calc(100dvh_-_var(--workbench-aside-top))] lg:overflow-y-auto"
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
