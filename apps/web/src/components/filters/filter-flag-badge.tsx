import { MinusIcon } from "lucide-react";

import { FILTER_TRIGGER_CLASS } from "@/components/filters/multi-select-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A tri-state boolean filter (Promo, Signed, Banned, Errata, Standard) rendered
 * in the same include/exclude language as the multi-select badges (ADR-034):
 * `label` is just the trait name, and the state drives the look — a primary fill
 * to require it, a struck-out destructive tint with a leading minus to forbid it
 * ("−Promo"), an outline when off. The click cycles null → true → false → null.
 * @returns The flag badge or button.
 */
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
          // Match the compact bar's other triggers (transparent resting fill,
          // muted hover) instead of the outline variant's solid bg-background.
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
