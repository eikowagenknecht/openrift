/**
 * Pure layout for the variant lineage graph (ADR-042): a family drawn the way a
 * commit graph is, one row per version with a version above the ones that came
 * from it. Rows never indent — a fork gets its own lane in a gutter to the left
 * — so versions that share no lineage read as a plain column of dots rather
 * than a staircase.
 *
 * The rail (lib/deck-variant-rail) lays the same family out sideways for the
 * deck page; this is the vertical, editable list.
 */

/** The slice of a deck summary the graph reads. */
export interface VariantGraphMember {
  id: string;
  /** ISO timestamp, used to order siblings and unrelated trees. */
  updatedAt: string;
  predecessorDeckId: string | null;
}

export interface VariantGraphRow {
  id: string;
  /** Column of this row's dot, counted from the left edge of the gutter. */
  lane: number;
  /** Whether a line runs into the dot from above, i.e. something came before. */
  hasParentAbove: boolean;
  /** Whether the line continues below the dot, on the same lane. */
  continuesBelow: boolean;
  /** Lanes a fork leaves this dot for; each is drawn as an elbow out of it. */
  branchLanes: number[];
  /** Lanes whose line passes straight through this row without touching it. */
  throughLanes: number[];
}

export interface VariantGraph {
  /** Rows top to bottom: every version above the ones that came from it. */
  rows: VariantGraphRow[];
  /** How many lanes the gutter has to be wide enough for. */
  laneCount: number;
}

/**
 * Each member's predecessor, resolved to another member of the same list. A
 * pointer at something outside the list (or at itself) reads as no pointer at
 * all, and a cycle is cut where it closes — the API prevents one, but a graph
 * walker must never trust that.
 *
 * @returns The parent of every member, by id.
 */
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

/**
 * The open deck and everything it descends from. Those stay on one straight
 * lane, so the version being looked at reads as the trunk.
 *
 * @returns The ids on the open deck's own line of descent.
 */
function ancestryIds(parents: ReadonlyMap<string, string | null>, currentId: string): Set<string> {
  const chain = new Set<string>();
  let cursor: string | null = currentId;
  while (cursor !== null && !chain.has(cursor)) {
    chain.add(cursor);
    cursor = parents.get(cursor) ?? null;
  }
  return chain;
}

/** A lane is claimed over a row span; another line may only reuse it outside. */
interface LaneSpan {
  start: number;
  end: number;
}

/**
 * Lays a variant family out as a vertical branch graph. A version sits directly
 * under the one it came from, on the same lane when it continues that line and
 * on the left-most free lane when it forks off one. Versions that came from
 * nothing start their own line, so a family with no links at all is a single
 * column of dots.
 *
 * @returns The computed rows and how many lanes they use.
 */
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

  // At a fork the version the open deck descends from goes first, so it keeps
  // its parent's lane; the rest follow oldest-first, the same older-above-newer
  // reading the rows themselves have.
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
  /** @returns This member's children, in the order they are drawn. */
  const children = (id: string): VariantGraphMember[] => {
    const known = ordered.get(id);
    if (known) {
      return known;
    }
    const sorted = (childrenOf.get(id) ?? []).toSorted(byDescent);
    ordered.set(id, sorted);
    return sorted;
  };

  /** @returns The most recent `updatedAt` anywhere in the tree under `member`. */
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
    // Newest tree last, so the eye ends on the freshest work. On a tie the open
    // deck's tree goes last, and the id keeps the rest of the order stable.
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

  // Depth-first, first child straight after its parent: that is what lets a
  // continued line be a single straight segment between two neighbouring rows.
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

  /**
   * The last row a lane stays busy once `member` is on it: its line of first
   * children, which is what keeps the lane. A fork leaves the lane at the row
   * it branches from, so it does not extend the run.
   *
   * @returns The row index the lane frees up after.
   */
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
  /** @returns The left-most lane free across the whole span. */
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
    // A fork's line leaves its parent's dot, so its lane is busy from that row
    // on, not just from its own.
    const start = parentId === null ? row : (rowOf.get(parentId) ?? row);
    laneOf.set(member.id, claimLane({ start, end: laneRunEnd(member) }));
  }

  // A fork runs down its own lane from the row it branched at, so every row in
  // between has that lane passing through it.
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
