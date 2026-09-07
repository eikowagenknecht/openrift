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

export const PageTopBarHeightContext = createContext(0);

// Returns 0 until hydration: a consumer hydrating after the provider must not
// read a nonzero height against 0-height server markup, or React can't patch the mismatch.
export function usePageTopBarHeight(): number {
  const height = use(PageTopBarHeightContext);
  const hydrated = useHydrated();
  return hydrated ? height : 0;
}

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

// -1px + -mt-px: at fractional browser zoom the header and bar blur layers
// snap to the device-pixel grid independently, rounding a flush edge into a visible seam.
const PAGE_TOP_BAR_GEOMETRY =
  "sticky top-[calc(var(--header-height)_-_1px)] z-30 -mt-px pt-3 pb-2 sm:pb-3";

// No gutter here: tailwind-merge can't cancel px-safe (cn("px-safe", "px-0")
// keeps both), so the capped branch applies it once, only on the inner column.
export const PAGE_TOP_BAR_STICKY_BASE = `${STICKY_SURFACE} ${PAGE_TOP_BAR_GEOMETRY}`;

// The surface rides a 100vw `before:` layer because the wrapper sits inside
// `<main>`, which CONTAINER_WIDTH caps, so a background on it stops mid-screen.
const PAGE_TOP_BAR_BLEED = `${PAGE_TOP_BAR_GEOMETRY} before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:bg-background [[data-frosted]_&]:before:bg-background/80 [[data-frosted]_&]:before:backdrop-blur-lg`;

export const PAGE_TOP_BAR_STICKY = `${PAGE_TOP_BAR_BLEED} px-safe`;

interface PageTopBarStickyProps extends ComponentProps<"div"> {
  width: PageWidth;
}

/** Sticky wrapper hosting a {@link PageTopBar}, aligning the bar's content with the page's content column. */
export function PageTopBarSticky({ width, className, children, ...props }: PageTopBarStickyProps) {
  return (
    // On `capped` the safe-area gutter lives on the inner column, so the
    // bleed wrapper must not add px-safe again.
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

/** Page description rendered below a {@link PageTopBarSticky} bar, never inside it, so the bar stays a single compact row. */
export function PageDescription({ className, children, ...props }: ComponentProps<"p">) {
  return (
    <p className={cn("text-muted-foreground", className)} {...props}>
      {children}
    </p>
  );
}

/** Must be wrapped in an element styled with {@link PAGE_TOP_BAR_STICKY} (or a portal slot that already applies it). */
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

// The persistent sidebar can eat most of the viewport on landscape phones
// (>= md), so the desktop toggle button must stay available there too.
export function PageTopBarTitle({ onToggleSidebar, children }: PageTopBarTitleProps) {
  if (onToggleSidebar) {
    return (
      <>
        {/* font-heading cascades into the Button label (buttonVariants sets weight/size but no family). */}
        <h1 className="font-heading md:hidden">
          <Button variant="ghost" className="mr-2 -ml-2.5 gap-1" onClick={onToggleSidebar}>
            {children}
            <ChevronDownIcon className="text-muted-foreground size-4" />
          </Button>
        </h1>
        {/* self-center: an icon-only button has no text baseline, so a parent
            items-baseline row would synthesize one from the icon's bottom edge. */}
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

export function PageTopBarActions({ children, className }: PageTopBarProps) {
  return (
    <div className={cn("ml-auto flex shrink-0 items-center gap-2", className)}>{children}</div>
  );
}

type PageTopBarButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "size">;

export function PageTopBarButton(props: PageTopBarButtonProps) {
  return <Button variant="ghost" {...props} />;
}

/** Use at most one per bar. */
export function PageTopBarPrimaryButton(props: PageTopBarButtonProps) {
  return <Button variant="default" {...props} />;
}

/** Always give it an `aria-label` or sr-only text. */
export function PageTopBarIconButton(props: PageTopBarButtonProps) {
  return <Button variant="ghost" size="icon" {...props} />;
}
