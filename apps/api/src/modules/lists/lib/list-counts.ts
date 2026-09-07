/** The slice of the lists repo the count expansion needs. */
interface CountExpander {
  expandedCounts: (listIds: readonly string[]) => Promise<Map<string, number>>;
}

/** A share/summary row carrying the cheap materialized count plus the rule flag. */
interface CountableListRow {
  listId: string;
  hasRule: boolean;
}

/**
 * A rule-based list's materialized `entryCount` reports 0 until expanded; a list
 * absent from the returned map keeps its materialized count instead.
 */
export function expandRuleListCounts(
  lists: CountExpander,
  rows: readonly CountableListRow[],
): Promise<Map<string, number>> {
  const ruleListIds = rows.filter((row) => row.hasRule).map((row) => row.listId);
  if (ruleListIds.length === 0) {
    return Promise.resolve(new Map<string, number>());
  }
  return lists.expandedCounts(ruleListIds);
}
