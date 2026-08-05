import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { cn } from "@/lib/utils";

/** Shared trigger styling so the icon reads the same in both variants. */
const TRIGGER_CLASS = "text-muted-foreground hover:text-foreground cursor-default";

/**
 * The (i) affordance that sits next to a field label and reveals a sentence of
 * explanatory copy.
 *
 * On a fine pointer this is a hover/focus Tooltip. On a coarse pointer it is a
 * tap-to-open Popover instead, because a Base UI tooltip cannot be opened by
 * touch at all: its hover interaction is registered with `mouseOnly: true`, and
 * its focus interaction bails unless the trigger matches `:focus-visible`,
 * which a tap-focused button does not. Without the swap the copy is simply
 * unreachable on phones.
 *
 * The pointer read comes from `useCoarsePointer`, so SSR and the first client
 * render always produce the tooltip variant and the popover takes over one
 * paint later.
 *
 * @returns The hint trigger and its overlay.
 */
export function InfoHint({
  label,
  children,
  className,
  side = "top",
}: {
  /** Name of the field the hint belongs to; forms the trigger's accessible name. */
  label: string;
  /** The hint copy. */
  children: ReactNode;
  /** Extra classes for the icon. */
  className?: string;
  /** Preferred side for the overlay. */
  side?: "top" | "bottom" | "left" | "right";
}) {
  const coarsePointer = useCoarsePointer();
  const triggerLabel = `${label} — what's this?`;
  const icon = <InfoIcon className={cn("size-3.5", className)} />;

  if (coarsePointer) {
    return (
      <Popover>
        <PopoverTrigger className={TRIGGER_CLASS} aria-label={triggerLabel}>
          {icon}
        </PopoverTrigger>
        {/* Narrower than the popover default and viewport-capped, since the hint is one sentence on a phone. */}
        <PopoverContent side={side} className="w-auto max-w-[min(20rem,calc(100vw-2rem))]">
          {children}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger className={TRIGGER_CLASS} aria-label={triggerLabel}>
        {icon}
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
