import { createLink } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronDownIcon, PanelLeftIcon } from "lucide-react";
import type { AnchorHTMLAttributes, ComponentProps } from "react";
import { createContext, forwardRef, useLayoutEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
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
 * makes sticky a no-op. `--header-height` includes the header's 1px border;
 * the bar sticks 1px above that (`calc(... - 1px)`) so it tucks under the
 * z-50 header — at fractional browser zoom the two blurred layers snap to the
 * device-pixel grid independently, and a flush edge can round apart into a
 * 1px seam of raw scrolling content. `-mt-px` shifts the bar's flow position
 * up by the same 1px so it equals the pin position — without it the bar
 * visibly travels 1px on the first scroll before sticking.
 */
// Base sticky styles WITHOUT the horizontal gutter. `px-safe` is a custom
// utility that tailwind-merge does not recognise, so adding `px-0` later does
// NOT cancel it (`cn("px-safe", "px-0")` keeps both) — the `maxWidth` branch
// would otherwise inherit `px-safe` on the full-bleed layer AND apply it again
// on the inner column, double-insetting the bar's content. Keep the gutter out
// of the base and add it explicitly only on the full-bleed (non-maxWidth) path.
// `pb-2` on mobile (not `py-3`): a borderless title sitting above content reads
// as more space than it measures, so the gap below it is tightened to 8px on
// phones to optically match the tighter rhythm of the controls below. Desktop
// keeps the 12px gap (`sm:pb-3`); the top stays 12px since the header's border
// anchors it (no optical inflation there).
// Exported for sidebar-column layouts (admin, collections): their content
// column already clears the iOS safe areas (ml-safe sidebar on the left,
// pr-safe on the right), so the bar must NOT re-apply px-safe — on notched
// phones in landscape that double-insets the bar's content by the safe-area
// width. Those layouts compose the base with column-relative padding instead.
export const PAGE_TOP_BAR_STICKY_BASE =
  "bg-background/80 sticky top-[calc(var(--header-height)_-_1px)] z-30 -mt-px pt-3 pb-2 backdrop-blur-lg sm:pb-3";

export const PAGE_TOP_BAR_STICKY = `${PAGE_TOP_BAR_STICKY_BASE} px-safe`;

const STICKY_MAX_WIDTH = {
  md: "max-w-md",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
} as const;

interface PageTopBarStickyProps extends ComponentProps<"div"> {
  /**
   * Width of the page's centered content column. The sticky layer (blur,
   * background) still spans the full viewport; only the bar's content is
   * constrained so it aligns with the column below. Omit on full-width pages.
   */
  maxWidth?: keyof typeof STICKY_MAX_WIDTH;
}

/**
 * Sticky wrapper hosting a {@link PageTopBar}. Pages with a centered
 * `max-w-*` content column pass `maxWidth` so the bar's content aligns with
 * that column instead of pinning to the viewport edge.
 * @returns The sticky wrapper element.
 */
export function PageTopBarSticky({
  maxWidth,
  className,
  children,
  ...props
}: PageTopBarStickyProps) {
  return (
    // With maxWidth, the horizontal padding moves inside the centered
    // container so the bar's content edges match a content column that is
    // `mx-auto max-w-* px-safe` (padding inside the measured box). The
    // full-bleed layer keeps no gutter (base styles) so its `px-safe` can't
    // stack with the inner column's `px-safe`; without maxWidth the gutter
    // lives on the sticky layer itself.
    <div
      className={cn(maxWidth ? PAGE_TOP_BAR_STICKY_BASE : PAGE_TOP_BAR_STICKY, className)}
      {...props}
    >
      {maxWidth ? (
        <div className={cn("px-safe mx-auto w-full", STICKY_MAX_WIDTH[maxWidth])}>{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * One-paragraph page description rendered as the first content block below a
 * {@link PageTopBarSticky} bar — never inside it, so the sticky bar stays a
 * single compact row.
 * @returns The description paragraph.
 */
export function PageDescription({ className, children, ...props }: ComponentProps<"p">) {
  return (
    <p className={cn("text-muted-foreground", className)} {...props}>
      {children}
    </p>
  );
}

/**
 * Unified top bar row, used by both deck and collection pages. Must be
 * wrapped in an element styled with {@link PAGE_TOP_BAR_STICKY} (or one of
 * the portal slots that already applies it).
 * @returns The top bar row element.
 */
export function PageTopBar({ children, className }: PageTopBarProps) {
  return <div className={cn("flex h-8 items-center text-sm", className)}>{children}</div>;
}

const BackAnchor = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  // oxlint-disable-next-line react/function-component-definition -- a forwardRef render function is a callback, so the function-expression form this rule wants trips prefer-arrow-callback instead; the two rules cannot both be satisfied here
  ({ children: _children, className, ...rest }, ref) => (
    <a
      ref={ref}
      {...rest}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), className)}
    >
      <ArrowLeftIcon className="size-4" />
    </a>
  ),
);
BackAnchor.displayName = "BackAnchor";

/**
 * Back arrow linking to a parent route. Fully type-checked against the
 * registered route tree, so `to` and `params` must match a real route.
 */
export const PageTopBarBack = createLink(BackAnchor);

interface PageTopBarTitleProps {
  onToggleSidebar?: () => void;
  children: React.ReactNode;
}

/**
 * Page title. On mobile, renders as a heading wrapping a button with a chevron
 * that toggles the sidebar. On desktop, renders a sidebar toggle icon button
 * next to a static heading — the persistent sidebar can eat most of the
 * viewport on landscape phones (≥ md), so it must stay collapsible there too.
 * @returns The title element.
 */
export function PageTopBarTitle({ onToggleSidebar, children }: PageTopBarTitleProps) {
  if (onToggleSidebar) {
    return (
      <>
        {/* font-heading cascades into the Button label (buttonVariants sets
            weight/size but no family). */}
        <h1 className="font-heading md:hidden">
          <Button variant="ghost" className="mr-2 -ml-2.5 gap-1" onClick={onToggleSidebar}>
            {children}
            <ChevronDownIcon className="text-muted-foreground size-4" />
          </Button>
        </h1>
        {/* self-center: an icon-only button has no text baseline, so a parent
            items-baseline row (collection/list headers) would synthesize one
            from the icon's bottom edge and shift the button up out of center. */}
        <Button
          variant="ghost"
          size="icon"
          className="mr-1 -ml-2 hidden self-center md:inline-flex"
          onClick={onToggleSidebar}
        >
          <PanelLeftIcon />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
        <h1 className="font-heading mr-2 hidden min-w-0 truncate text-lg font-semibold md:block">
          {children}
        </h1>
      </>
    );
  }
  return <h1 className="font-heading mr-2 min-w-0 truncate text-lg font-semibold">{children}</h1>;
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

// Top-bar action buttons. Use these (not a raw <Button>) for everything inside
// PageTopBarActions so every bar stays visually identical: one shared height
// (h-8) and a fixed emphasis ladder — ghost for secondary + icon buttons, one
// filled primary per bar. `variant` and `size` are intentionally locked, so
// they can't drift surface to surface. Render as a link or a dialog/menu
// trigger target via the `render` prop, exactly like the underlying Button.
type PageTopBarButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "size">;

/**
 * Secondary labeled action in a page top bar (Import, Share, Export, …). Ghost
 * emphasis, full bar height.
 * @returns The action button.
 */
export function PageTopBarButton(props: PageTopBarButtonProps) {
  return <Button variant="ghost" {...props} />;
}

/**
 * The single primary call-to-action in a page top bar (e.g. New Deck). Filled,
 * so it carries the app's corner-cut signature via the default Button variant.
 * Use at most one per bar.
 * @returns The primary action button.
 */
export function PageTopBarPrimaryButton(props: PageTopBarButtonProps) {
  return <Button variant="default" {...props} />;
}

/**
 * Icon-only action or overflow-menu trigger in a page top bar. Ghost, square,
 * full bar height. Always give it an `aria-label` or sr-only text.
 * @returns The icon action button.
 */
export function PageTopBarIconButton(props: PageTopBarButtonProps) {
  return <Button variant="ghost" size="icon" {...props} />;
}
