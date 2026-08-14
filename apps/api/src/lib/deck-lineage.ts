/**
 * Lineage rules for deck variant families (ADR-042). The predecessor pointers
 * inside one family form a forest, and the only way to break that is to point a
 * deck at one of its own descendants.
 */

/** The slice of a family member the lineage walk needs. */
export interface LineageMember {
  id: string;
  predecessorDeckId: string | null;
}

/**
 * Walks up from the proposed predecessor. Reaching `deckId` means the pointer
 * would close a loop, because the proposed parent already descends from the
 * deck being repointed. The `seen` guard keeps a family that somehow already
 * holds a loop from spinning here.
 *
 * @returns True when setting the pointer would create a cycle.
 */
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
