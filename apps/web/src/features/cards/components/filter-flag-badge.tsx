import { MinusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FILTER_TRIGGER_CLASS } from "@/features/cards/components/multi-select-combobox";
import { cn } from "@/lib/utils";

export function FlagBadge({
  label,
  state,
  count,
  onClick,
  triggerStyle = "chip",
}: {
  label: string;
  state: boolean | null;
  count?: number;
  onClick: () => void;
  /** "chip" = panel badge; "button" = outline button matching the compact bar. */
  triggerStyle?: "chip" | "button";
}) {
  const isActive = state !== null;
  const isExcluded = state === false;
  const isZero = count !== undefined && count === 0;
  const content = (
    <>
      {isExcluded && <MinusIcon className="size-3 shrink-0" />}
      <span className={cn(isExcluded && "line-through")}>{label}</span>
      {count !== undefined && <span className="tabular-nums opacity-60">{count}</span>}
    </>
  );
  if (triggerStyle === "button") {
    return (
      <Button
        variant={state === true ? "default" : "outline"}
        size="sm"
        className={cn(
          "gap-1 font-medium",
          state !== true && FILTER_TRIGGER_CLASS,
          isExcluded && "border-destructive/40 text-destructive",
          isZero && !isActive && "opacity-40",
        )}
        onClick={onClick}
      >
        {content}
      </Button>
    );
  }
  return (
    <Badge
      variant={state === true ? "default" : "outline"}
      className={cn(
        "cursor-pointer gap-1",
        isExcluded && "border-destructive/40 text-destructive",
        isZero && !isActive && "opacity-40",
      )}
      onClick={onClick}
    >
      {content}
    </Badge>
  );
}
