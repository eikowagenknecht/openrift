/**
 * A family is a set of decks sharing a `familyId`; the list shows one entry
 * per family, fronted by the primary variant, with the rest revealed on demand.
 */
interface DeckFamilyItem {
  deck: { id: string; familyId: string | null; isPrimary: boolean };
}

export interface DeckFamilyEntry {
  id: string;
  memberCount: number;
  expanded: boolean;
  role: "front" | "member";
}

export interface CollapsedDeckEntry<T> {
  item: T;
  family?: DeckFamilyEntry;
}

/** The front renders at its own sorted position, not the first member's. */
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
