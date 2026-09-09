import type { LucideIcon } from "lucide-react";
import { InfoIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cn } from "@/lib/utils";

export interface IntroGuideRow {
  icons: readonly LucideIcon[];
  title: string;
  description: ReactNode;
  desktopOnly?: boolean;
  mobileOnly?: boolean;
}

function guideRowClass(row: IntroGuideRow): string {
  if (row.desktopOnly) {
    return "hidden items-start gap-2 sm:flex";
  }
  if (row.mobileOnly) {
    return "flex items-start gap-2 sm:hidden";
  }
  return "flex items-start gap-2";
}

export function IntroBanner({
  title,
  lead,
  onDismiss,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  lead: ReactNode;
  onDismiss: () => void;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Callout className={className}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        aria-label="Dismiss this guide"
        className="text-muted-foreground absolute top-2 right-2"
      >
        <XIcon className="size-4" />
      </Button>
      <div className={cn("flex gap-3 pr-6", bodyClassName)}>
        <InfoIcon className="text-primary mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-muted-foreground mt-0.5">{lead}</p>
          </div>
          {children}
        </div>
      </div>
    </Callout>
  );
}

export function IntroGuideList({
  rows,
  className,
}: {
  rows: readonly IntroGuideRow[];
  className?: string;
}) {
  return (
    <ul className={cn("grid gap-2 @lg:grid-cols-2", className)}>
      {rows.map((row) => (
        <li key={row.title} className={guideRowClass(row)}>
          <IntroGuideIcons icons={row.icons} />
          <div>
            <span className="font-medium">{row.title}</span>
            <p className="text-muted-foreground">{row.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function IntroGuideIcons({ icons }: { icons: readonly LucideIcon[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {icons.map((Icon, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- static icon list, never reordered
        <span
          key={index}
          className="bg-background flex size-6 items-center justify-center rounded-md border"
        >
          <Icon className="size-3.5" />
        </span>
      ))}
    </span>
  );
}
