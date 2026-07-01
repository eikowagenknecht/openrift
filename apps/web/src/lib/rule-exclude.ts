import type {
  CardFilters,
  ListEntryDetailResponse,
  ListKind,
  ListRule,
  Printing,
} from "@openrift/shared";
import { filterCards } from "@openrift/shared";

/**
 * The card/printing/copy a user picked to drop from a list's dynamic rules
 * (ADR-034). Exactly the id matching `kind` is set; the others are absent.
 */
export interface RuleExcludeTarget {
  kind: ListKind;
  cardId?: string;
  printingId?: string;
  copyId?: string;
}

/**
 * Narrows a rendered list entry to the {@link RuleExcludeTarget} the exclude
 * action operates on — the single id that matches the entry's kind.
 * @returns The exclude target for the entry.
 */
export function entryToExcludeTarget(entry: ListEntryDetailResponse): RuleExcludeTarget {
  if (entry.kind === "card") {
    return { kind: "card", cardId: entry.cardId };
  }
  if (entry.kind === "printing") {
    return { kind: "printing", printingId: entry.printingId };
  }
  return { kind: "copy", copyId: entry.copyId };
}

/** @returns Whether a wish rule's filter currently yields the target card/printing. */
function wishRuleMatches(
  filter: CardFilters,
  target: RuleExcludeTarget,
  catalog: Printing[],
): boolean {
  const matched = filterCards(catalog, filter);
  if (target.kind === "card") {
    return matched.some((printing) => printing.cardId === target.cardId);
  }
  return matched.some((printing) => printing.id === target.printingId);
}

/**
 * Computes the rules a list should carry after the user excludes one rendered
 * entry (ADR-034). Because a card/printing can be produced by several wish
 * rules, the id is added to the `excludeIds` of *every* wish rule whose filter
 * still matches it — otherwise a sibling rule would keep re-adding it. Trade
 * lists carry a single rule, so a copy id is appended to its `excludeCopyIds`.
 *
 * Returns `null` when nothing would change (no producing rule, or the id is
 * already excluded), so the caller can skip the PATCH.
 *
 * @returns The next rules array, or `null` when the exclude is a no-op.
 */
export function excludeEntryFromRules(
  rules: ListRule[],
  target: RuleExcludeTarget,
  catalog: Printing[],
): ListRule[] | null {
  let changed = false;
  const next = rules.map((rule): ListRule => {
    if (rule.kind === "wish") {
      const id = target.kind === "card" ? target.cardId : target.printingId;
      if (!id || rule.excludeIds.includes(id) || !wishRuleMatches(rule.filter, target, catalog)) {
        return rule;
      }
      changed = true;
      return { ...rule, excludeIds: [...rule.excludeIds, id] };
    }
    if (target.kind !== "copy" || !target.copyId || rule.excludeCopyIds.includes(target.copyId)) {
      return rule;
    }
    changed = true;
    return { ...rule, excludeCopyIds: [...rule.excludeCopyIds, target.copyId] };
  });
  return changed ? next : null;
}
