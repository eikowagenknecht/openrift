import type { EntrySource } from "@openrift/shared/types/api/list";
import { BanIcon, SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { cn } from "@/lib/utils";

const RULE_LABEL = "Added by a list rule";

export function isRuleSourced(source: EntrySource): boolean {
  return source === "rule" || source === "both";
}

export function RuleSourceBadge({
  quantity,
  className,
  onExclude,
  excludeLabel = "Don't include this",
}: {
  quantity?: number;
  className?: string;
  onExclude?: () => void;
  excludeLabel?: string;
}) {
  return (
    <Badge
      variant="subtle"
      // Must match countPillVariants in ui/count-pill.tsx.
      className={cn("rounded-md border-0 bg-transparent", onExclude && "pr-0.5", className)}
      title={quantity === undefined ? RULE_LABEL : `${quantity} added by a list rule`}
    >
      <SparklesIcon aria-hidden />
      {quantity === undefined ? "Rule" : <span className="tabular-nums">{quantity}</span>}
      {onExclude ? (
        <ChipRemoveButton
          tabIndex={-1}
          aria-label={excludeLabel}
          title={excludeLabel}
          className="hover:bg-destructive/15 hover:text-destructive -my-0.5 p-0.5"
          onClick={(event) => {
            event.stopPropagation();
            onExclude();
          }}
        >
          <BanIcon className="size-3" aria-hidden />
        </ChipRemoveButton>
      ) : null}
    </Badge>
  );
}
