import { filterCards } from "@openrift/shared/filters";
import type { ListEntryDetailResponse, ListKind } from "@openrift/shared/types/api/list";
import type { Printing } from "@openrift/shared/types/catalog";
import type { ListRule } from "@openrift/shared/types/list-rule";
import type { CardFilters } from "@openrift/shared/types/search";

/**
 * The card/printing/copy a user picked to drop from a list's dynamic rules.
 * Exactly the id matching `kind` is set; the others are absent.
 */
export interface RuleExcludeTarget {
  kind: ListKind;
  cardId?: string;
  printingId?: string;
  copyId?: string;
}

export function entryToExcludeTarget(entry: ListEntryDetailResponse): RuleExcludeTarget {
  if (entry.kind === "card") {
    return { kind: "card", cardId: entry.cardId };
  }
  if (entry.kind === "printing") {
    return { kind: "printing", printingId: entry.printingId };
  }
  return { kind: "copy", copyId: entry.copyId };
}

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
 * The id is excluded from every wish rule whose filter still matches it, since a
 * card/printing can be produced by several. Returns null when nothing would change.
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
