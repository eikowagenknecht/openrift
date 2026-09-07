/**
 * Predecessor pointers within one deck variant family form a forest; the only
 * way to break that is to point a deck at one of its own descendants.
 */

/** The slice of a family member the lineage walk needs. */
export interface LineageMember {
  id: string;
  predecessorDeckId: string | null;
}

/** The `seen` guard keeps an already-corrupt family from spinning here forever. */
export function createsCycle(
  members: readonly LineageMember[],
  deckId: string,
  predecessorDeckId: string,
): boolean {
  const byId = new Map(members.map((member) => [member.id, member]));
  const seen = new Set<string>();
  let cursor: string | null = predecessorDeckId;
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === deckId) {
      return true;
    }
    seen.add(cursor);
    cursor = byId.get(cursor)?.predecessorDeckId ?? null;
  }
  return false;
}
