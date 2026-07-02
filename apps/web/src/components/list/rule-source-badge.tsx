import type { EntrySource } from "@openrift/shared";
import { BanIcon, SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const RULE_LABEL = "Added by a list rule";

/**
 * True when an entry's source means a dynamic rule produced it (ADR-034).
 *
 * @returns Whether the source is `rule` or `both`.
 */
export function isRuleSourced(source: EntrySource): boolean {
  return source === "rule" || source === "both";
}

/**
 * Marks an entry that a dynamic list rule produced (ADR-034). Always carries the
 * visible "Rule" label so a card corner reads as clearly as the table view. When
 * {@link quantity} is set, the chip reports the rule's contribution (the additive
 * model shows the rule part here and the editable manual part beside it) as
 * `✨ ×N`; the "Rule" label form is used when no count is meaningful (copies).
 *
 * When {@link onExclude} is set, the badge carries a trailing exclude marker — a
 * "ban" button that drops the entry from the rule. Hanging it inside the badge
 * (rather than as a loose icon nearby) keeps it obvious that excluding is a
 * rule-level action, not a normal "remove this entry".
 *
 * @returns A subtle primary-tinted badge with a sparkle icon.
 */
export function RuleSourceBadge({
  quantity,
  className,
  onExclude,
  excludeLabel = "Don't include this",
}: {
  /** When set, the chip shows the rule's contributed count (`✨ ×N`). */
  quantity?: number;
  className?: string;
  onExclude?: () => void;
  excludeLabel?: string;
}) {
  return (
    <Badge
      variant="subtle"
      // Match the neutral count pill exactly — same opaque muted background,
      // rounded-rect, no border — so the rule chip reads as its sibling; the
      // primary-colored sparkle + count (text-primary from the subtle variant)
      // are what set it apart. See COUNT_PILL_BASE in cards/count-pill.ts.
      className={cn("bg-muted rounded-md border-0", onExclude && "pr-0.5", className)}
      title={quantity === undefined ? RULE_LABEL : `${quantity} added by a list rule`}
    >
      <SparklesIcon aria-hidden />
      {quantity === undefined ? "Rule" : <span className="tabular-nums">×{quantity}</span>}
      {onExclude ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={excludeLabel}
          title={excludeLabel}
          className="hover:bg-destructive/15 hover:text-destructive -my-0.5 ml-0.5 rounded-sm p-0.5"
          onClick={(event) => {
            event.stopPropagation();
            onExclude();
          }}
        >
          <BanIcon className="size-3" aria-hidden />
        </button>
      ) : null}
    </Badge>
  );
}
