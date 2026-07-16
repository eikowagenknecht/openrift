import type { ComponentType, ReactNode, SVGProps } from "react";

import type { IconChipTone } from "@/components/ui/icon-chip";
import { IconChip } from "@/components/ui/icon-chip";
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
  /** Leading icon, rendered as a small tinted {@link IconChip}. Used by
   * section headers that carry a per-surface identity (the Trades page). */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** The icon chip's tint. Ignored without `icon`. */
  tone?: IconChipTone;
  className?: string;
}

/**
 * The app's in-page section heading: a small uppercase muted label, optionally
 * preceded by a tinted icon chip and followed by a count. `size="sm"` is the
 * quieter sub-group variant (e.g. the activity feed's day buckets).
 *
 * @returns The heading element.
 */
export function SectionHeading({
  children,
  count,
  size = "default",
  as: Tag = "h2",
  icon,
  tone = "neutral",
  className,
}: SectionHeadingProps) {
  const label = (
    <>
      {children}
      {count === undefined ? null : (
        <span className="text-muted-foreground/60 ml-1.5 tabular-nums">{count}</span>
      )}
    </>
  );
  return (
    <Tag
      data-slot="section-heading"
      className={cn(
        "font-medium tracking-wide uppercase",
        size === "default" ? "text-muted-foreground text-sm" : "text-muted-foreground/70 text-2xs",
        icon !== undefined && "flex items-center gap-2.5",
        className,
      )}
    >
      {icon === undefined ? (
        label
      ) : (
        <>
          <IconChip icon={icon} tone={tone} size="sm" />
          <span>{label}</span>
        </>
      )}
    </Tag>
  );
}
