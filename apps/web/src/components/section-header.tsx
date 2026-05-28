import type { ComponentProps } from "react";

import { Heading } from "@/components/heading";
import type { HeadingLevel } from "@/components/heading";
import { cn } from "@/lib/utils";

export function SectionHeader({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="section-header"
      className={cn("flex items-start justify-between gap-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionHeaderGroup({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="section-header-group"
      className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}
      {...props}
    >
      {children}
    </div>
  );
}

type SectionHeaderTitleProps = Omit<ComponentProps<"h1">, "ref"> & {
  level?: HeadingLevel;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
};

export function SectionHeaderTitle({ level = 2, as, ...props }: SectionHeaderTitleProps) {
  return <Heading level={level} as={as} {...props} />;
}

export function SectionHeaderDescription({ className, children, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="section-header-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function SectionHeaderActions({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="section-header-actions"
      className={cn("flex shrink-0 items-center gap-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}
