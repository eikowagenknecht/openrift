import { RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ResetButtonProps {
  onClick: () => void;
  label: string;
}

/**
 * Small "reset to default" icon button used across the profile preference
 * rows. Wraps a ghost icon button in a tooltip.
 * @returns The tooltip-wrapped reset button.
 */
export function ResetButton({ onClick, label }: ResetButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClick}
            className="text-muted-foreground relative z-10"
            aria-label={label}
          />
        }
      >
        <RotateCcwIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>Reset to default</TooltipContent>
    </Tooltip>
  );
}
