import type { RuleResponse } from "@openrift/shared";

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
  /** For `changed` rules: the rule's content as of the previous version. */
  previousContent?: string;
  /**
   * For `moved` rules: the rule_number this content used to live under.
   * For `replaced` rules: the rule_number where the previous content now lives.
   */
  relatedRuleNumber?: string;
}) {
  // Per-row store subscriptions: only this row re-renders when its own fold
  // state or any of its ancestors' fold state flips. The parent doesn't
  // subscribe to fold state at all, so its `.map()` result stays cached
  // across fold toggles and the React Compiler can do its job.
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
          // The copy glyph is drawn by `rule-copy-affordance` as a ::after mask
          // rather than a <CopyIcon> element. It is decorative and hover-only,
          // and this page renders ~2,400 of them — as markup that was ~1.05 MB
          // of the document. See the utility's note in index.css.
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
