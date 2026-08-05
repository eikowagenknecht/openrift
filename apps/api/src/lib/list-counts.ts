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
 * Builds a map of expanded entry counts for the rule-based lists among `rows`.
 *
 * The materialized `entryCount` on a share/summary row counts only manual
 * `list_entries`, so a rule-based (dynamic) list reports 0 until its rules are
 * evaluated (ADR-034). This expands just those lists — manual lists are already
 * exact — so callers can override the count only where it's wrong. Returns a
 * `listId → count` map; a list absent from the map keeps its materialized count.
 *
 * The expansion itself is batched inside `lists.expandedCounts`, so this stays a
 * `hasRule` filter: a page of purely manual lists never reaches the repo, and a
 * page with rule lists costs a constant handful of queries rather than a few per
 * list. `expandedCounts` re-reads the rules itself, so a stale flag on a row can
 * only cost a wasted call, never a wrong count.
 *
 * @param lists The lists repo (only `expandedCounts` is used).
 * @param rows The share/summary rows to inspect for rule-based lists.
 * @returns A map from list id to its rule-expanded entry count.
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
