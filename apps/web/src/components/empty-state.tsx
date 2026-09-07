import type { ComponentType, ReactNode, SVGProps } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

function EmptyCardFan({ icon: Icon }: { icon?: ComponentType<SVGProps<SVGSVGElement>> }) {
  const sideCardClass =
    "aspect-card absolute bottom-0 left-1/2 w-16 origin-bottom -translate-x-1/2 rounded-md border border-dashed";
  return (
    <div className="relative h-[100px] w-36" aria-hidden="true">
      <span className={cn(sideCardClass, "-rotate-12")} />
      <span className={cn(sideCardClass, "rotate-12")} />
      {/* Center card is opaque so the side outlines don't show through it. */}
      <span
        className={cn(
          sideCardClass,
          "border-muted-foreground/40 bg-card flex items-center justify-center",
        )}
      >
        {Icon && <Icon className="text-muted-foreground size-6 opacity-70" />}
      </span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia>
          <EmptyCardFan icon={icon} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}
