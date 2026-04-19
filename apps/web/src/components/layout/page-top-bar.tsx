import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronDownIcon } from "lucide-react";
import { createContext, useLayoutEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PageTopBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Measured height of the page's sticky top bar, in pixels. Consumers (e.g.
 * CardViewer) add this to their own sticky offsets so their toolbars sit
 * directly below the page top bar instead of being hidden behind it.
 */
export const PageTopBarHeightContext = createContext(0);

/**
 * Observe `el` and return its measured border-box height.
 * @returns The element's current height in pixels.
 */
export function useMeasuredHeight(el: HTMLElement | null) {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (!el) {
      setHeight(0);
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const h = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
      setHeight(Math.round(h));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return height;
}

/**
 * Tailwind classes applied to the sticky slot/wrapper that hosts a
 * {@link PageTopBar}. Sticks below the global header so the back button and
 * title stay visible while scrolling. Expect the hosting element to have room
 * to scroll (a tall parent); applying this to a wrapper that hugs its content
 * makes sticky a no-op. `--header-height` is h-14 (56px) and the site header
 * also has a 1px border-b, so we add 1px to sit flush below the border —
 * matches APP_HEADER_HEIGHT (57) so CardViewer's toolbar stacks seamlessly.
 */
export const PAGE_TOP_BAR_STICKY =
  "bg-background/80 sticky top-[calc(var(--header-height)+1px)] z-30 px-3 py-3 backdrop-blur-lg";

/**
 * Unified top bar row, used by both deck and collection pages. Must be
 * wrapped in an element styled with {@link PAGE_TOP_BAR_STICKY} (or one of
 * the portal slots that already applies it).
 * @returns The top bar row element.
 */
export function PageTopBar({ children, className }: PageTopBarProps) {
  return <div className={cn("flex h-8 items-center text-sm", className)}>{children}</div>;
}

/**
 * Back arrow linking to a parent route.
 * @returns The back arrow link element.
 */
export function PageTopBarBack({ to }: { to: string }) {
  return (
    <Link to={to} className="hover:bg-muted rounded-md p-1.5">
      <ArrowLeftIcon className="size-4" />
    </Link>
  );
}

interface PageTopBarTitleProps {
  onToggleSidebar?: () => void;
  children: React.ReactNode;
}

/**
 * Page title. On mobile, renders as a heading wrapping a button with a chevron
 * that toggles the sidebar. On desktop, renders as a static heading (sidebar
 * is always visible).
 * @returns The title element.
 */
export function PageTopBarTitle({ onToggleSidebar, children }: PageTopBarTitleProps) {
  if (onToggleSidebar) {
    return (
      <>
        <h1 className="md:hidden">
          <Button
            variant="ghost"
            className="mr-2 gap-1 text-sm font-medium"
            onClick={onToggleSidebar}
          >
            {children}
            <ChevronDownIcon className="text-muted-foreground size-4" />
          </Button>
        </h1>
        <h1 className="mr-2 hidden min-w-0 truncate px-3 text-lg font-semibold md:block">
          {children}
        </h1>
      </>
    );
  }
  return <h1 className="mr-2 min-w-0 truncate px-3 text-lg font-semibold">{children}</h1>;
}

/**
 * Right-aligned action buttons area.
 * @returns The actions container element.
 */
export function PageTopBarActions({ children, className }: PageTopBarProps) {
  return (
    <div className={cn("ml-auto flex shrink-0 items-center gap-2", className)}>{children}</div>
  );
}
