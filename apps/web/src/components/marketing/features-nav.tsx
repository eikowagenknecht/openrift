import type { MouseEvent } from "react";
import { useEffect, useState } from "react";

import { usePageTopBarHeight } from "@/components/layout/page-top-bar";
import { STICKY_SURFACE } from "@/lib/sticky-surface";
import { cn } from "@/lib/utils";

import { cornerClip } from "./clip-frame";
import type { FeatureChapter } from "./features-chapters";
import { chapterAnchor } from "./features-chapters";

/** Fraction of the viewport height at which a divider counts as reached. */
const READING_LINE = 1 / 3;

const SCROLL_DURATION_MS = 450;

let scrollFrame = 0;

/** The window offset that lands `target` where its scroll-margin/-padding put an anchor jump. */
function scrollDestination(target: HTMLElement): number {
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- CSS px string; Number() would yield NaN
  const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- CSS px string; Number() would yield NaN
  const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop);
  const offset = (Number.isNaN(padding) ? 0 : padding) + (Number.isNaN(margin) ? 0 : margin);
  return target.getBoundingClientRect().top + window.scrollY - offset;
}

// Re-reads the destination every frame: content-visibility sections between
// here and the target render in during the scroll and shift its position, so
// a fixed destination would land short.
function animateScrollTo(target: HTMLElement) {
  cancelAnimationFrame(scrollFrame);
  const from = window.scrollY;
  let startedAt: number | undefined;
  function step(now: number) {
    startedAt ??= now;
    const t = Math.min((now - startedAt) / SCROLL_DURATION_MS, 1);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    window.scrollTo(0, from + (scrollDestination(target) - from) * eased);
    if (t < 1) {
      scrollFrame = requestAnimationFrame(step);
    }
  }
  scrollFrame = requestAnimationFrame(step);
}

/**
 * Smooth-scrolls to an in-page anchor instead of jumping. Hand-animated
 * rather than native smooth scrolling, which browsers silently disable with
 * OS animation settings, and deliberately not `scroll-behavior: smooth` on
 * the root, which would also smooth the router's scroll restoration.
 * Modified clicks keep the browser default, and reduced motion keeps the
 * instant jump.
 */
export function smoothAnchorClick(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const hash = event.currentTarget.hash;
  const target = hash ? document.querySelector<HTMLElement>(`#${CSS.escape(hash.slice(1))}`) : null;
  if (!target) {
    return;
  }
  event.preventDefault();
  history.pushState(null, "", hash);
  if (globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo(0, scrollDestination(target));
    return;
  }
  animateScrollTo(target);
}

const CHIP_CUT = 8;

/**
 * Id of the chapter the viewer is reading, or null above the first divider.
 *
 * Chapters are regions, not elements: a divider stays the active one until the
 * next divider passes the reading line, long after it has left the viewport.
 * The observer is therefore only a change trigger, watching a band (the top
 * third of the viewport) that every divider must cross. Each callback then
 * recomputes the last divider above the line from live rects, which also makes
 * scrolling back up work without extra state.
 *
 * @returns The active chapter id, or null.
 */
export function useActiveChapter(chapterIds: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const chapterKey = chapterIds.join(" ");

  useEffect(() => {
    const dividers = chapterKey
      .split(" ")
      .filter(Boolean)
      .map((id) => ({
        id,
        element: document.querySelector<HTMLElement>(`#${CSS.escape(chapterAnchor(id))}`),
      }))
      .filter(
        (divider): divider is { id: string; element: HTMLElement } => divider.element !== null,
      );

    function update() {
      const line = window.innerHeight * READING_LINE;
      let reached: string | null = null;
      for (const divider of dividers) {
        if (divider.element.getBoundingClientRect().top <= line) {
          reached = divider.id;
        }
      }
      setActiveId(reached);
    }

    // Measure first: with no dividers on the page nothing is reached, which
    // clears the rail, and there is then nothing to observe.
    update();
    if (dividers.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(update, {
      rootMargin: `0px 0px -${Math.round((1 - READING_LINE) * 100)}% 0px`,
    });
    for (const divider of dividers) {
      observer.observe(divider.element);
    }
    return () => observer.disconnect();
  }, [chapterKey]);

  return activeId;
}

/**
 * Desktop scroll-spy rail pinned to the right gutter. The gutter is 128px at
 * `xl`, so the rail stays narrow enough to clear the `max-w-5xl` column.
 * @returns The rail navigation.
 */
export function FeaturesRail({ chapters }: { chapters: FeatureChapter[] }) {
  const activeId = useActiveChapter(chapters.map((chapter) => chapter.id));

  return (
    <nav
      aria-label="Chapters"
      className="bg-background/60 fixed top-1/2 right-3 z-40 hidden -translate-y-1/2 flex-col py-1 backdrop-blur-sm xl:flex"
    >
      {chapters.map((chapter) => {
        const Icon = chapter.icon;
        const isActive = chapter.id === activeId;
        return (
          <a
            key={chapter.id}
            href={`#${chapterAnchor(chapter.id)}`}
            onClick={smoothAnchorClick}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "flex items-center gap-2 border-l-2 py-1.5 pl-2 text-xs whitespace-nowrap transition-colors",
              isActive
                ? "border-border-accent text-primary font-medium"
                : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{chapter.title}</span>
          </a>
        );
      })}
    </nav>
  );
}

/**
 * Phone and tablet chapter chips, stuck below the page top bar. Sits at `z-20`
 * so the bar above keeps painting over it.
 * @returns The chip navigation.
 */
export function FeaturesChipNav({ chapters }: { chapters: FeatureChapter[] }) {
  const activeId = useActiveChapter(chapters.map((chapter) => chapter.id));
  const topBarHeight = usePageTopBarHeight();
  const [scroller, setScroller] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!scroller || !activeId) {
      return;
    }
    const chip = scroller.querySelector<HTMLElement>(`[data-chapter="${activeId}"]`);
    if (!chip) {
      return;
    }
    // scrollIntoView would scroll the page vertically too; only scrollLeft moves here.
    const chipBox = chip.getBoundingClientRect();
    const scrollerBox = scroller.getBoundingClientRect();
    const centered = chipBox.left - scrollerBox.left - (scrollerBox.width - chipBox.width) / 2;
    scroller.scrollTo({ left: scroller.scrollLeft + centered, behavior: "smooth" });
  }, [scroller, activeId]);

  return (
    <div
      className={cn(STICKY_SURFACE, "sticky z-20 py-2 xl:hidden")}
      style={{ top: `calc(var(--header-height) + ${topBarHeight}px)` }}
    >
      <nav
        aria-label="Chapters"
        ref={setScroller}
        className="px-safe mx-auto flex w-full max-w-5xl [scrollbar-width:none] gap-2 overflow-x-auto"
      >
        {chapters.map((chapter) => {
          const Icon = chapter.icon;
          const isActive = chapter.id === activeId;
          return (
            <a
              key={chapter.id}
              data-chapter={chapter.id}
              href={`#${chapterAnchor(chapter.id)}`}
              onClick={smoothAnchorClick}
              aria-current={isActive ? "true" : undefined}
              style={{ clipPath: cornerClip(CHIP_CUT) }}
              className={cn(
                "flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                isActive
                  ? "bg-muted dark:bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{chapter.title}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
