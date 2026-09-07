import { ArrowLeftIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, Fragment } from "react";

import { PageTopBar, PageTopBarActions, PageTopBarSticky } from "@/components/layout/page-top-bar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TopBarCrumb {
  label: string;
  link?: ReactElement<{ children?: ReactNode; className?: string; "aria-label"?: string }>;
}

/** Exported so a bar with its own page title can separate a trail without re-deriving the glyph. */
export function TopBarBreadcrumbSeparator({ className }: { className?: string }) {
  return <span className={cn("text-muted-foreground/60", className)}>/</span>;
}

/** On `sm`+ a clickable breadcrumb, on phones a single back arrow to the nearest linked parent. */
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

/** For drill-down pages that don't already render their own PageTopBar. */
export function TopBarBreadcrumbBar({
  segments,
  actions,
}: {
  segments: TopBarCrumb[];
  actions?: ReactNode;
}) {
  return (
    <PageTopBarSticky width="capped">
      <PageTopBar className="gap-2">
        <TopBarBreadcrumbTrail segments={segments} />
        {actions ? <PageTopBarActions>{actions}</PageTopBarActions> : null}
      </PageTopBar>
    </PageTopBarSticky>
  );
}
