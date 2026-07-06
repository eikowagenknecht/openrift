import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type HeadingLevel = 1 | 2 | 3;
type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

const HEADING_STYLES: Record<HeadingLevel, string> = {
  // Levels 1-2 carry the app-chrome display face; level 3 sits too close to
  // body size, where the display face reads as noise instead of identity.
  1: "font-heading text-2xl font-bold",
  2: "font-heading text-lg font-semibold",
  3: "text-base font-medium",
};

type HeadingProps = Omit<ComponentProps<"h1">, "ref"> & {
  level?: HeadingLevel;
  as?: HeadingTag;
};

export function Heading({ level = 2, as, className, children, ...props }: HeadingProps) {
  const Tag: HeadingTag = as ?? (`h${level}` as HeadingTag);
  return (
    <Tag data-slot="heading" className={cn(HEADING_STYLES[level], className)} {...props}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ className, children, ...props }: ComponentProps<"h4">) {
  return (
    <h4
      data-slot="eyebrow"
      className={cn("text-muted-foreground mb-3 font-semibold tracking-wide uppercase", className)}
      {...props}
    >
      {children}
    </h4>
  );
}
