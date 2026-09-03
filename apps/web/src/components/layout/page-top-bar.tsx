import { createLink } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronDownIcon, PanelLeftIcon } from "lucide-react";
import type { AnchorHTMLAttributes, ComponentProps } from "react";
import { createContext, forwardRef, use, useLayoutEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { STICKY_SURFACE } from "@/lib/sticky-surface";
import type { PageWidth } from "@/lib/utils";
import { cn, PAGE_WIDTH } from "@/lib/utils";

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
 * Render-safe page top bar height for sticky offsets.
 *
 * Returns 0 until the client has hydrated, which is what the server rendered:
 * measurement happens in `useMeasuredHeight`'s layout effect, so no server
 * render ever sees a bar height. Read the context raw instead and any consumer
 * that hydrates *later* than the provider — a card browser inside a `<Suspense>`
 * under a `BuilderWorkbench`, say — computes its `top` / `--sticky-top` from an
 * already-measured bar while hydrating against markup the server wrote with 0.
 * React refuses to patch that up ("a tree hydrated but some attributes of the
 * server rendered HTML didn't match the client properties") and leaves the
 * server's offsets in the DOM until something else re-renders the subtree.
 *
 * The gate only covers the hydration render itself; `useHydrated` flips right
 * after the boundary commits, so the live offset lands in the same frame.
 *
 * @returns The measured bar height in pixels, or 0 before hydration.
 */
export function usePageTopBarHeight(): number {
  const height = use(PageTopBarHeightContext);
  const hydrated = useHydrated();
  return hydrated ? height : 0;
}

/**
 * Observe `el` and return its measured border-box height.
 * @returns The element's current height in pixels.
 */
export function useMeasuredHeight(el: HTMLElement | null) {
  const [height, setHeight] = useState(0);
  const [measuredEl, setMeasuredEl] = useState(el);
  if (measuredEl !== el) {
    setMeasuredEl(el);
    if (!el) {
      setHeight(0);
    }
  }
  useLayoutEffect(() => {
    if (!el) {
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
// NOT cancel it (`cn("px-safe", "px-0")` keeps both) — the `capped` branch
// would otherwise inherit `px-safe` on the full-bleed layer AND apply it again
// on the inner column, double-insetting the bar's content. Keep the gutter out
// of the base and add it explicitly only on the full-bleed path.
// `pb-2` on mobile (not `py-3`): a borderless title sitting above content reads
// as more space than it measures, so the gap below it is tightened to 8px on
// phones to optically match the tighter rhythm of the controls below. Desktop
// keeps the 12px gap (`sm:pb-3`); the top stays 12px since the header's border
// anchors it (no optical inflation there).
// Exported for column layouts (the admin and collections sidebars, the rules
// ToC): their content column already clears the iOS safe areas (ml-safe
// sidebar on the left, pr-safe on the right), so the bar must NOT re-apply
// px-safe — on notched phones in landscape that double-insets the bar's
// content by the safe-area width. Those layouts compose the base with
// column-relative padding, and keep the surface on the element itself so it
// stays inside the column.
const PAGE_TOP_BAR_GEOMETRY =
  "sticky top-[calc(var(--header-height)_-_1px)] z-30 -mt-px pt-3 pb-2 sm:pb-3";

export const PAGE_TOP_BAR_STICKY_BASE = `${STICKY_SURFACE} ${PAGE_TOP_BAR_GEOMETRY}`;

// The surface rides a 100vw `before:` layer because the wrapper sits inside
// `<main>`, which CONTAINER_WIDTH caps, so a background on it stops mid-screen.
export const PAGE_TOP_BAR_BLEED = `${PAGE_TOP_BAR_GEOMETRY} before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:bg-background [[data-frosted]_&]:before:bg-background/80 [[data-frosted]_&]:before:backdrop-blur-lg`;

export const PAGE_TOP_BAR_STICKY = `${PAGE_TOP_BAR_BLEED} px-safe`;

interface PageTopBarStickyProps extends ComponentProps<"div"> {
  /**
   * Width of the page's content column, matching the `PAGE_WIDTH[width]`
   * wrapper below the bar. The sticky layer (blur, background) always spans
   * the full viewport; only the bar's content is constrained. Required, so
   * every page states which of the two widths it is.
   */
  width: PageWidth;
}

/**
 * Sticky wrapper hosting a {@link PageTopBar}, aligning the bar's content with
 * the page's content column.
 * @returns The sticky wrapper element.
 */
export function PageTopBarSticky({ width, className, children, ...props }: PageTopBarStickyProps) {
  return (
    // On `capped`, the horizontal padding moves inside the centered container
    // so the bar's content edges match a content column that is `mx-auto
    // max-w-5xl px-safe` (padding inside the measured box). That branch keeps
    // no gutter of its own so its `px-safe` can't stack with the inner
    // column's; on `full` the gutter lives on the sticky element itself.
    <div
      className={cn(width === "capped" ? PAGE_TOP_BAR_BLEED : PAGE_TOP_BAR_STICKY, className)}
      {...props}
    >
      {width === "capped" ? (
        <div className={cn("px-safe", PAGE_WIDTH.capped)}>{children}</div>
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
