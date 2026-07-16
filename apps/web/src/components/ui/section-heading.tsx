import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  children: ReactNode;
  /** Muted tabular count rendered after the label. */
  count?: number;
  size?: "default" | "sm";
  /** Heading tag; pick by document outline, not by size. `span` is for labels
   * inside interactive elements (collapsible triggers), which only allow
   * phrasing content. */
  as?: "h2" | "h3" | "span";
  className?: string;
}

/**
 * The app's in-page section heading: a small uppercase muted label, optionally
 * followed by a count. `size="sm"` is the quieter sub-group variant (e.g. the
 * activity feed's day buckets).
 *
 * @returns The heading element.
 */
export function SectionHeading({
  children,
  count,
  size = "default",
  as: Tag = "h2",
  className,
}: SectionHeadingProps) {
  return (
    <Tag
      data-slot="section-heading"
      className={cn(
        "font-medium tracking-wide uppercase",
        size === "default" ? "text-muted-foreground text-sm" : "text-muted-foreground/70 text-2xs",
        className,
      )}
    >
      {children}
      {count === undefined ? null : (
        <span className="text-muted-foreground/60 ml-1.5 tabular-nums">{count}</span>
      )}
    </Tag>
  );
}
