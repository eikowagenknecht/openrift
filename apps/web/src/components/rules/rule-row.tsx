import type { RuleResponse } from "@openrift/shared/types/api/rules";

import { Badge } from "@/components/ui/badge";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Pressable } from "@/components/ui/pressable";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChangeKind } from "@/lib/rules-changes";
import { CHANGE_KIND_BADGE } from "@/lib/rules-changes";
import { cn } from "@/lib/utils";
import { useRulesDiffExpandStore } from "@/stores/rules-diff-expand-store";
import { useRulesFoldStore } from "@/stores/rules-fold-store";

import { copyRuleLink, formatRuleNumber, InlineDiff, RuleContent } from "./rule-content";

export function RuleRow({
  rule,
  ancestors,
  hasChildren,
  isContext,
  termAnchors,
  changeKind,
  previousContent,
  relatedRuleNumber,
}: {
  rule: RuleResponse;
  ancestors: readonly string[];
  hasChildren: boolean;
  isContext?: boolean;
  termAnchors: ReadonlyMap<string, string>;
  changeKind?: ChangeKind;
  previousContent?: string;
  relatedRuleNumber?: string;
}) {
  // Fold state is subscribed per-row, not by the parent, so its `.map()`
  // result stays cached across fold toggles.
  const isFolded = useRulesFoldStore((state) => state.foldedRules.has(rule.ruleNumber));
  const isHidden = useRulesFoldStore((state) =>
    ancestors.some((ancestor) => state.foldedRules.has(ancestor)),
  );
  const toggle = useRulesFoldStore((state) => state.toggle);
  const isDiffExpanded = useRulesDiffExpandStore((state) =>
    state.expandedRules.has(rule.ruleNumber),
  );
  const toggleDiff = useRulesDiffExpandStore((state) => state.toggle);

  const isTitle = rule.ruleType === "title";
  const isSubtitle = rule.ruleType === "subtitle";
  const contentIndentClass =
    rule.depth === 0
      ? ""
      : rule.depth === 1
        ? "pl-3 sm:pl-6"
        : rule.depth === 2
          ? "pl-6 sm:pl-12"
          : "pl-9 sm:pl-18";

  const isRemoved = changeKind === "removed";
  const isChanged = changeKind === "changed";
  const badge = changeKind ? CHANGE_KIND_BADGE[changeKind] : null;
  const showInlineDiff = isChanged && isDiffExpanded && previousContent !== undefined;

  return (
    <div
      id={`rule-${rule.ruleNumber}`}
      className={cn(
        "border-border/50 flex scroll-mt-14 items-baseline border-b py-1.5 text-sm",
        isHidden && "hidden",
        isTitle && "border-border mt-4 first:mt-0",
        isSubtitle && "border-border mt-2",
        isContext && "opacity-60",
        isRemoved && "line-through decoration-from-font opacity-60",
        isFolded && hasChildren && "bg-muted/50",
      )}
    >
      <Pressable
        onClick={() => {
          void copyRuleLink(rule.ruleNumber);
        }}
        aria-label={`Copy link to rule ${formatRuleNumber(rule.ruleNumber)}`}
        className={cn(
          // Copy glyph is a ::after mask via rule-copy-affordance, not a <CopyIcon>
          // element, since this page renders ~2,400 of them. See index.css.
          "rule-copy-affordance text-muted-foreground hover:text-foreground mr-3 flex shrink-0 items-start gap-1 font-mono text-xs no-underline",
          isTitle && "font-semibold",
        )}
      >
        <span>{formatRuleNumber(rule.ruleNumber)}</span>
      </Pressable>
      <span
        className={cn(
          "min-w-0 flex-1",
          contentIndentClass,
          isTitle && "text-base font-bold",
          isSubtitle && "font-semibold",
        )}
      >
        {badge ? (
          isChanged && previousContent !== undefined ? (
            <Badge
              render={
                // oxlint-disable-next-line react/forbid-elements -- bare render slot; Badge owns all styling
                <button
                  type="button"
                  onClick={() => toggleDiff(rule.ruleNumber)}
                  aria-expanded={isDiffExpanded}
                  aria-label={
                    isDiffExpanded
                      ? `Hide diff for rule ${formatRuleNumber(rule.ruleNumber)}`
                      : `Show diff for rule ${formatRuleNumber(rule.ruleNumber)}`
                  }
                />
              }
              className={cn(
                "mr-2 cursor-pointer align-baseline no-underline hover:opacity-80",
                badge.className,
              )}
            >
              {badge.label}
            </Badge>
          ) : (changeKind === "moved" || changeKind === "replaced") &&
            relatedRuleNumber !== undefined ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge
                      className={cn(
                        "mr-2 cursor-help align-baseline no-underline",
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </Badge>
                  }
                />
                <TooltipContent>
                  {changeKind === "moved"
                    ? `Moved from ${formatRuleNumber(relatedRuleNumber)}`
                    : `Previous content moved to ${formatRuleNumber(relatedRuleNumber)}`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Badge className={cn("mr-2 align-baseline no-underline", badge.className)}>
              {badge.label}
            </Badge>
          )
        ) : null}
        {hasChildren ? (
          <span className="float-right ml-3 flex size-4 shrink-0 items-start">
            <ExpandToggle
              expanded={!isFolded}
              onClick={() => toggle(rule.ruleNumber)}
              aria-label={isFolded ? "Expand rule group" : "Collapse rule group"}
              className="text-muted-foreground hover:text-foreground size-4 justify-center gap-0 rounded-md no-underline"
              chevronClassName="size-3 text-inherit"
            />
          </span>
        ) : null}
        {showInlineDiff ? (
          <InlineDiff oldText={previousContent} newText={rule.content} />
        ) : isTitle || isSubtitle ? (
          rule.content
        ) : (
          <RuleContent
            content={rule.content}
            termAnchors={termAnchors}
            ruleNumber={rule.ruleNumber}
          />
        )}
      </span>
    </div>
  );
}
