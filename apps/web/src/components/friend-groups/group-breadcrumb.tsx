import { ArrowLeftIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, Fragment } from "react";

import { PAGE_TOP_BAR_STICKY, PageTopBar } from "@/components/layout/page-top-bar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface GroupCrumb {
  label: string;
  /**
   * Link to this level (e.g. `<Link to="/groups/$slug" params={{ slug }} />`);
   * the label is injected as its children. Omit for the current page, which
   * renders as plain text.
   */
  link?: ReactElement<{ children?: ReactNode; className?: string; "aria-label"?: string }>;
}

/**
 * The groups area's unified drill-down trail: on `sm`+ a clickable breadcrumb
 * ("Group / Events / My Little Tournament"), on phones collapsed to a single
 * back arrow pointing at the nearest linked parent. Inline so it can sit in an
 * existing PageTopBar; pages without one use {@link GroupBreadcrumbBar}.
 * @returns The trail element.
 */
export function GroupBreadcrumbTrail({ segments }: { segments: GroupCrumb[] }) {
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
            {index > 0 ? <span className="text-muted-foreground/60">/</span> : null}
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
 * Standalone sticky bar hosting a {@link GroupBreadcrumbTrail}, for drill-down
 * pages that don't already render their own PageTopBar.
 * @returns The sticky breadcrumb bar.
 */
export function GroupBreadcrumbBar({ segments }: { segments: GroupCrumb[] }) {
  return (
    <div className={PAGE_TOP_BAR_STICKY}>
      <div className="mx-auto w-full max-w-5xl">
        <PageTopBar className="gap-2">
          <GroupBreadcrumbTrail segments={segments} />
        </PageTopBar>
      </div>
    </div>
  );
}
