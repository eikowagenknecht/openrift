import { ArrowLeftIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, Fragment } from "react";

import { PageTopBar, PageTopBarSticky } from "@/components/layout/page-top-bar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TopBarCrumb {
  label: string;
  /**
   * Link to this level (e.g. `<Link to="/groups/$slug" params={{ slug }} />`);
   * the label is injected as its children. Omit for the current page, which
   * renders as plain text.
   */
  link?: ReactElement<{ children?: ReactNode; className?: string; "aria-label"?: string }>;
}

/**
 * Separator between breadcrumb levels. Exported so a bar that follows a trail
 * with its own page title can separate the two without re-deriving the glyph.
 * @returns The separator element.
 */
export function TopBarBreadcrumbSeparator({ className }: { className?: string }) {
  return <span className={cn("text-muted-foreground/60", className)}>/</span>;
}

/**
 * The unified drill-down trail: on `sm`+ a clickable breadcrumb
 * ("Group / Events / My Little Tournament"), on phones collapsed to a single
 * back arrow pointing at the nearest linked parent. Inline so it can sit in an
 * existing PageTopBar; pages without one use {@link TopBarBreadcrumbBar}.
 * @returns The trail element.
 */
export function TopBarBreadcrumbTrail({ segments }: { segments: TopBarCrumb[] }) {
  const parent = segments.findLast((segment) => segment.link);
  return (
    <>
      {parent?.link
        ? cloneElement(parent.link, {
            "aria-label": `Back to ${parent.label}`,
            className: cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "sm:hidden"),
            children: <ArrowLeftIcon className="size-4" />,
          })
        : null}
      <span className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
        {segments.map((segment, index) => (
          <Fragment key={`${segment.label}:${index}`}>
            {index > 0 ? <TopBarBreadcrumbSeparator /> : null}
            {segment.link ? (
              cloneElement(segment.link, {
                className: "text-muted-foreground hover:text-foreground truncate",
                children: segment.label,
              })
            ) : (
              <span className="truncate font-medium">{segment.label}</span>
            )}
          </Fragment>
        ))}
      </span>
    </>
  );
}

/**
 * Standalone sticky bar hosting a {@link TopBarBreadcrumbTrail}, for drill-down
 * pages that don't already render their own PageTopBar.
 * @returns The sticky breadcrumb bar.
 */
export function TopBarBreadcrumbBar({
  segments,
  maxWidth = "5xl",
}: {
  segments: TopBarCrumb[];
  maxWidth?: "md" | "4xl" | "5xl" | "6xl";
}) {
  return (
    <PageTopBarSticky maxWidth={maxWidth}>
      <PageTopBar className="gap-2">
        <TopBarBreadcrumbTrail segments={segments} />
      </PageTopBar>
    </PageTopBarSticky>
  );
}
