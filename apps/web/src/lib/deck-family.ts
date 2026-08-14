/**
 * Variant families in the deck list (ADR-042). A family is a set of decks
 * sharing a `familyId`; the list shows one entry per family, fronted by the
 * primary variant, with the rest revealed on demand.
 */

/** The shape `collapseFamilies` reads. Anything carrying a deck summary fits. */
interface DeckFamilyItem {
  deck: { id: string; familyId: string | null; isPrimary: boolean };
}

export interface DeckFamilyEntry {
  id: string;
  /** Family members present in *this* list — a filter can hide some of them. */
  memberCount: number;
  expanded: boolean;
  /** "front" carries the expand control; "member" is one of the revealed siblings. */
  role: "front" | "member";
}

export interface CollapsedDeckEntry<T> {
  item: T;
  /** Absent for a standalone deck, which has no family to expand. */
  family?: DeckFamilyEntry;
}

/**
 * Collapses each variant family in an already-filtered-and-sorted list down to
 * its front, optionally followed by the rest of the family.
 *
 * The front is the primary variant when it survived the filters, and otherwise
 * the first member in list order — so a family never vanishes just because its
 * primary was filtered out. It renders at its own sorted position rather than
 * at the family's first member, which keeps the list's sort honest: the entry
 * the user sees is the deck the sort ordered.
 * @returns One entry per rendered row, in render order.
 */
export function collapseFamilies<T extends DeckFamilyItem>(
  items: T[],
  expandedFamilies: ReadonlySet<string>,
): CollapsedDeckEntry<T>[] {
  const membersByFamily = new Map<string, T[]>();
  for (const item of items) {
    const familyId = item.deck.familyId;
    if (familyId === null) {
      continue;
    }
    const members = membersByFamily.get(familyId);
    if (members) {
      members.push(item);
    } else {
      membersByFamily.set(familyId, [item]);
    }
  }

  // Front ids up front: a family's front can sit anywhere in the list, so the
  // render loop has to know it before it reaches the family's first member.
  const frontIds = new Map<string, string>();
  for (const [familyId, members] of membersByFamily) {
    const primary = members.find((member) => member.deck.isPrimary);
    const front = primary ?? members[0];
    if (front) {
      frontIds.set(familyId, front.deck.id);
    }
  }

  const entries: CollapsedDeckEntry<T>[] = [];
  for (const item of items) {
    const familyId = item.deck.familyId;
    if (familyId === null) {
      entries.push({ item });
      continue;
    }
    const frontId = frontIds.get(familyId);
    if (frontId !== item.deck.id) {
      // Non-front members are emitted alongside their front, or not at all.
      continue;
    }
    const members = membersByFamily.get(familyId) ?? [];
    const expanded = expandedFamilies.has(familyId);
    const family = { id: familyId, memberCount: members.length, expanded };
    entries.push({ item, family: { ...family, role: "front" } });
    if (!expanded) {
      continue;
    }
    for (const member of members) {
      if (member.deck.id !== frontId) {
        entries.push({ item: member, family: { ...family, role: "member" } });
      }
    }
  }
  return entries;
}
