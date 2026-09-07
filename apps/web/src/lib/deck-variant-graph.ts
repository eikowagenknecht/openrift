/**
 * Layout for the variant lineage graph: one row per version, drawn like a
 * commit graph. Rows never indent; a fork gets its own lane in a gutter to
 * the left instead. lib/deck-variant-rail lays the same family out sideways.
 */

export interface VariantGraphMember {
  id: string;
  /** ISO timestamp. */
  updatedAt: string;
  predecessorDeckId: string | null;
}

export interface VariantGraphRow {
  id: string;
  lane: number;
  hasParentAbove: boolean;
  continuesBelow: boolean;
  branchLanes: number[];
  throughLanes: number[];
}

export interface VariantGraph {
  rows: VariantGraphRow[];
  laneCount: number;
}

// The API prevents cycles in predecessorDeckId, but a graph walker must not
// trust that; a cycle is cut where it closes.
function resolveParents(members: readonly VariantGraphMember[]): Map<string, string | null> {
  const ids = new Set(members.map((member) => member.id));
  const parents = new Map<string, string | null>(
    members.map((member) => [
      member.id,
      member.predecessorDeckId !== null &&
      member.predecessorDeckId !== member.id &&
      ids.has(member.predecessorDeckId)
        ? member.predecessorDeckId
        : null,
    ]),
  );
  for (const member of members) {
    const walking = new Set<string>([member.id]);
    let cursor = parents.get(member.id) ?? null;
    while (cursor !== null) {
      if (walking.has(cursor)) {
        parents.set(cursor, null);
        break;
      }
      walking.add(cursor);
      cursor = parents.get(cursor) ?? null;
    }
  }
  return parents;
}

function ancestryIds(parents: ReadonlyMap<string, string | null>, currentId: string): Set<string> {
  const chain = new Set<string>();
  let cursor: string | null = currentId;
  while (cursor !== null && !chain.has(cursor)) {
    chain.add(cursor);
    cursor = parents.get(cursor) ?? null;
  }
  return chain;
}

// A lane is claimed over a row span; another line may only reuse it outside that span.
interface LaneSpan {
  start: number;
  end: number;
}

export function buildVariantGraph(
  members: readonly VariantGraphMember[],
  currentId: string,
): VariantGraph {
  if (members.length === 0) {
    return { rows: [], laneCount: 0 };
  }

  const parents = resolveParents(members);
  const chain = ancestryIds(parents, currentId);

  const childrenOf = new Map<string, VariantGraphMember[]>();
  const roots: VariantGraphMember[] = [];
  for (const member of members) {
    const parentId = parents.get(member.id) ?? null;
    if (parentId === null) {
      roots.push(member);
      continue;
    }
    childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), member]);
  }

  // At a fork, the version the open deck descends from goes first so it keeps
  // its parent's lane; the rest follow oldest-first.
  const byDescent = (left: VariantGraphMember, right: VariantGraphMember): number => {
    const leftOnChain = chain.has(left.id) ? 0 : 1;
    const rightOnChain = chain.has(right.id) ? 0 : 1;
    if (leftOnChain !== rightOnChain) {
      return leftOnChain - rightOnChain;
    }
    const byUpdated = left.updatedAt.localeCompare(right.updatedAt);
    return byUpdated === 0 ? left.id.localeCompare(right.id) : byUpdated;
  };

  const ordered = new Map<string, VariantGraphMember[]>();
  const children = (id: string): VariantGraphMember[] => {
    const known = ordered.get(id);
    if (known) {
      return known;
    }
    const sorted = (childrenOf.get(id) ?? []).toSorted(byDescent);
    ordered.set(id, sorted);
    return sorted;
  };

  const treeNewest = (member: VariantGraphMember): string => {
    let newest = member.updatedAt;
    for (const child of children(member.id)) {
      const childNewest = treeNewest(child);
      if (childNewest > newest) {
        newest = childNewest;
      }
    }
    return newest;
  };

  let currentRootId = currentId;
  let currentRootParent = parents.get(currentRootId) ?? null;
  while (currentRootParent !== null) {
    currentRootId = currentRootParent;
    currentRootParent = parents.get(currentRootId) ?? null;
  }

  roots.sort((left, right) => {
    // Newest tree last. On a tie the open deck's tree goes last.
    const byNewest = treeNewest(left).localeCompare(treeNewest(right));
    if (byNewest !== 0) {
      return byNewest;
    }
    const leftOpen = left.id === currentRootId ? 1 : 0;
    const rightOpen = right.id === currentRootId ? 1 : 0;
    if (leftOpen !== rightOpen) {
      return leftOpen - rightOpen;
    }
    return left.id.localeCompare(right.id);
  });

  // Depth-first, first child right after its parent.
  const order: VariantGraphMember[] = [];
  const visit = (member: VariantGraphMember): void => {
    order.push(member);
    for (const child of children(member.id)) {
      visit(child);
    }
  };
  for (const root of roots) {
    visit(root);
  }
  const rowOf = new Map(order.map((member, index) => [member.id, index]));

  // The last row a lane stays busy: the end of member's line of first children.
  // A fork leaves the lane at the row it branches from.
  const laneRunEnd = (member: VariantGraphMember): number => {
    let cursor = member;
    let next = children(cursor.id)[0];
    while (next) {
      cursor = next;
      next = children(cursor.id)[0];
    }
    return rowOf.get(cursor.id) ?? 0;
  };

  const laneSpans: LaneSpan[][] = [];
  const laneOf = new Map<string, number>();
  const claimLane = (span: LaneSpan): number => {
    let lane = 0;
    while (
      (laneSpans[lane] ?? []).some((taken) => taken.start <= span.end && span.start <= taken.end)
    ) {
      lane += 1;
    }
    laneSpans[lane] = [...(laneSpans[lane] ?? []), span];
    return lane;
  };

  for (const member of order) {
    const row = rowOf.get(member.id) ?? 0;
    const parentId = parents.get(member.id) ?? null;
    const continuesParent = parentId !== null && children(parentId)[0]?.id === member.id;
    if (continuesParent) {
      // The parent already holds the lane for its whole line of first children.
      laneOf.set(member.id, laneOf.get(parentId) ?? 0);
      continue;
    }
    // A fork's lane is busy starting at its parent's row, not just its own.
    const start = parentId === null ? row : (rowOf.get(parentId) ?? row);
    laneOf.set(member.id, claimLane({ start, end: laneRunEnd(member) }));
  }

  // A fork's lane passes through every row between its branch point and its own row.
  const through = new Map<number, Set<number>>();
  for (const member of order) {
    const parentId = parents.get(member.id) ?? null;
    if (parentId === null) {
      continue;
    }
    const lane = laneOf.get(member.id) ?? 0;
    const from = rowOf.get(parentId) ?? 0;
    const to = rowOf.get(member.id) ?? 0;
    for (let row = from + 1; row < to; row += 1) {
      const lanes = through.get(row) ?? new Set<number>();
      lanes.add(lane);
      through.set(row, lanes);
    }
  }

  const rows = order.map((member, index) => {
    const descendants = children(member.id);
    return {
      id: member.id,
      lane: laneOf.get(member.id) ?? 0,
      hasParentAbove: (parents.get(member.id) ?? null) !== null,
      continuesBelow: descendants.length > 0,
      branchLanes: descendants.slice(1).map((child) => laneOf.get(child.id) ?? 0),
      throughLanes: [...(through.get(index) ?? [])].toSorted((left, right) => left - right),
    };
  });

  return {
    rows,
    laneCount: rows.reduce((widest, row) => Math.max(widest, row.lane + 1), 1),
  };
}
