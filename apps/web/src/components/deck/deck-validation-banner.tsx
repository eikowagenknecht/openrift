import type { DeckViolation } from "@openrift/shared";
import { CheckIcon, CircleAlertIcon, LoaderCircleIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

/**
 * Badge showing violation count with a click-to-open popover listing each violation.
 * @returns The violation badge element.
 */
function ViolationBadge({
  violations,
  violationCount,
}: {
  violations: DeckViolation[];
  violationCount: number;
}) {
  return (
    <Popover>
      <PopoverTrigger nativeButton={false} render={<span />}>
        <span className="flex shrink-0 cursor-default items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Constructed
          <CircleAlertIcon className="size-3" />
          <span>
            {violationCount} {violationCount === 1 ? "issue" : "issues"}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-auto max-w-80 p-2">
        <ul className="space-y-0.5">
          {violations.map((violation) => (
            <li key={violation.code} className="text-xs">
              {violation.message}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Format badge showing "Constructed ✓", "Freeform", or violation count.
 * @returns The format badge element.
 */
export function DeckFormatBadge() {
  const violations = useDeckBuilderStore((state) => state.violations);
  const format = useDeckBuilderStore((state) => state.format);

  const isValid = format === "freeform" || violations.length === 0;

  if (isValid) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
        {format === "freeform" ? "Freeform" : "Constructed"}
        <CheckIcon className="size-3" />
      </span>
    );
  }

  return <ViolationBadge violations={violations} violationCount={violations.length} />;
}

interface DeckSaveStatusProps {
  isDirty: boolean;
  isSaving: boolean;
}

/**
 * Save status indicator showing "Saving", "Unsaved", or "Saved".
 * @returns The save status element.
 */
export function DeckSaveStatus({ isDirty, isSaving }: DeckSaveStatusProps) {
  return (
    <span className="text-muted-foreground flex shrink-0 items-center text-xs">
      {isSaving ? (
        <Tooltip>
          <TooltipTrigger className="flex items-center">
            <LoaderCircleIcon className="size-3 animate-spin" />
          </TooltipTrigger>
          <TooltipContent>Saving</TooltipContent>
        </Tooltip>
      ) : isDirty ? (
        <Tooltip>
          <TooltipTrigger className="flex items-center">
            <span className="size-2 rounded-full bg-amber-500" />
          </TooltipTrigger>
          <TooltipContent>Unsaved</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger className="flex items-center">
            <CheckIcon className="size-3" />
          </TooltipTrigger>
          <TooltipContent>Saved</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
