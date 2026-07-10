import type { ListKind } from "@openrift/shared";

/** The slice of the lists repo the count expansion needs. */
interface EntryExpander {
  entriesWithDetailsAnon: (listId: string, kind: ListKind) => Promise<unknown[]>;
}

/** A share/summary row carrying the cheap materialized count plus the rule flag. */
interface CountableListRow {
  listId: string;
  listKind: string;
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
 * @param lists The lists repo (only `entriesWithDetailsAnon` is used).
 * @param rows The share/summary rows to inspect for rule-based lists.
 * @returns A map from list id to its rule-expanded entry count.
 */
export async function expandRuleListCounts(
  lists: EntryExpander,
  rows: readonly CountableListRow[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  await Promise.all(
    rows
      .filter((row) => row.hasRule)
      .map(async (row) => {
        const entries = await lists.entriesWithDetailsAnon(row.listId, row.listKind as ListKind);
        counts.set(row.listId, entries.length);
      }),
  );
  return counts;
}
