/**
 * Pure layout and labeling for the variant rail (ADR-042): the branch graph
 * shown below the deck hero. The component only draws what this module
 * computes, so the interesting logic stays unit-testable.
 */

/** The slice of a deck summary the rail reads. */
export interface RailMemberInput {
  id: string;
  name: string;
  /** ISO timestamp, used to order siblings and to break overflow ties. */
  updatedAt: string;
  predecessorDeckId: string | null;
  isDraft: boolean;
}

export interface RailNode {
  id: string;
  /** Short label per the one-naming-rule (family prefix stripped). */
  label: string;
  /** The stored name, for the popover. */
  fullName: string;
  isCurrent: boolean;
  isDraft: boolean;
  /** Row, from the top. Lane 0 carries the open deck's own line of descent. */
  lane: number;
  /** Column, in generations from the family's oldest drawn ancestor. */
  x: number;
}

export interface RailEdge {
  /** The older end (the predecessor). */
  fromId: string;
  toId: string;
}

export interface RailLayout {
  nodes: RailNode[];
  edges: RailEdge[];
  /** Family members that didn't fit; the rail shows them as "+N more". */
  overflowCount: number;
}

const MAX_LABEL_CHARS = 18;

/**
 * The rail's one naming rule: show the member's name minus what it shares with
 * the family. A name of the form `<base> (<rest>)` collapses to `<rest>`;
 * anything else shows as-is. The default checkpoint name ends in a bare ISO
 * day, which is already the app's date form, so it needs no reformatting.
 * Labels are capped at {@link MAX_LABEL_CHARS}.
 *
 * @returns The label to draw at the node.
 */
export function railLabel(name: string, familyBaseName: string): string {
  let label = name;
  const prefix = `${familyBaseName} (`;
  if (name.startsWith(prefix) && name.endsWith(")")) {
    const rest = name.slice(prefix.length, -1);
    if (rest.length > 0) {
      label = rest;
    }
  }
  if (label.length > MAX_LABEL_CHARS) {
    return `${label.slice(0, MAX_LABEL_CHARS - 1)}…`;
  }
  return label;
}

/**
 * Walks the open deck's ancestry: current, its predecessor, and so on, for as
 * long as the pointer stays inside the family. Guards against cycles, which
 * the API prevents but a graph walker must never trust.
 *
 * @returns The chain oldest-first, ending with the current deck.
 */
function ancestryChain(
  byId: ReadonlyMap<string, RailMemberInput>,
  currentId: string,
): RailMemberInput[] {
  const chain: RailMemberInput[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(currentId);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.predecessorDeckId ? byId.get(cursor.predecessorDeckId) : undefined;
  }
  return chain.toReversed();
}

/**
 * Which members the rail draws when the family is larger than `maxNodes`. The
 * open deck's ancestry wins the space (newest generations first, since those
 * are the ones a reader is comparing against), and whatever is left goes to the
 * most recently updated of the others.
 *
 * @returns The drawn members plus how many were left out.
 */
function selectDrawnMembers(
  members: readonly RailMemberInput[],
  chain: readonly RailMemberInput[],
  maxNodes: number,
): { drawn: RailMemberInput[]; overflowCount: number } {
  const keptChain = chain.length > maxNodes ? chain.slice(chain.length - maxNodes) : chain;
  const keptChainIds = new Set(keptChain.map((member) => member.id));
  const rest = members
    .filter((member) => !keptChainIds.has(member.id))
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const keptRest = rest.slice(0, Math.max(0, maxNodes - keptChain.length));
  return {
    drawn: [...keptChain, ...keptRest],
    overflowCount: members.length - keptChain.length - keptRest.length,
  };
}

/**
 * Generation of every drawn member, counting from its oldest drawn ancestor. A
 * pointer at a member that isn't drawn (dropped by the overflow, or in another
 * family) reads as no pointer at all, which is what puts an adopted member at
 * the left edge with no line into it.
 *
 * @returns Each member's column, and the drawn parent it descends from.
 */
function resolveGenerations(drawn: readonly RailMemberInput[]): {
  depths: Map<string, number>;
  parents: Map<string, string | null>;
} {
  const drawnIds = new Set(drawn.map((member) => member.id));
  const parents = new Map<string, string | null>(
    drawn.map((member) => [
      member.id,
      member.predecessorDeckId && drawnIds.has(member.predecessorDeckId)
        ? member.predecessorDeckId
        : null,
    ]),
  );
  const depths = new Map<string, number>();
  const depthOf = (id: string, walking: Set<string>): number => {
    const known = depths.get(id);
    if (known !== undefined) {
      return known;
    }
    if (walking.has(id)) {
      // A cycle the API shouldn't allow: cut it here so the family still draws.
      parents.set(id, null);
      depths.set(id, 0);
      return 0;
    }
    walking.add(id);
    const parentId = parents.get(id) ?? null;
    const depth = parentId === null ? 0 : depthOf(parentId, walking) + 1;
    depths.set(id, depth);
    return depth;
  };
  for (const member of drawn) {
    depthOf(member.id, new Set());
  }
  return { depths, parents };
}

/**
 * Lays a variant family out as a branch graph. Every drawn member is placed in
 * the column of its generation, and every predecessor pointer between two drawn
 * members becomes an edge — including pointers that have nothing to do with the
 * open deck, which is what makes the graph read as the family's history rather
 * than as one deck's ancestry.
 *
 * Lane 0 is the open deck's own line: its ancestry runs along it, and each
 * further branch takes the first row that is still free at its column.
 *
 * Members that share no lineage form separate trees, and those run side by side
 * along the same rows rather than stacking — a family of unrelated versions is
 * one line, not a column of one-dot rows. The newest tree sits right-most, which
 * continues the older-to-newer reading that holds inside a tree.
 *
 * @returns The computed layout.
 */
export function buildRailLayout(
  members: readonly RailMemberInput[],
  currentId: string,
  maxNodes = 6,
): RailLayout {
  const byId = new Map(members.map((member) => [member.id, member]));
  const current = byId.get(currentId);
  if (!current) {
    return { nodes: [], edges: [], overflowCount: 0 };
  }

  const chain = ancestryChain(byId, currentId);
  const chainIds = new Set(chain.map((member) => member.id));
  const { drawn, overflowCount } = selectDrawnMembers(members, chain, maxNodes);
  const { depths, parents } = resolveGenerations(drawn);

  const children = new Map<string, RailMemberInput[]>();
  const roots: RailMemberInput[] = [];
  for (const member of drawn) {
    const parentId = parents.get(member.id) ?? null;
    if (parentId === null) {
      roots.push(member);
      continue;
    }
    children.set(parentId, [...(children.get(parentId) ?? []), member]);
  }

  // The open deck's line runs straight, so at every fork the child that leads
  // to it goes first; the rest follow newest-first.
  const byDescent = (left: RailMemberInput, right: RailMemberInput): number => {
    const leftOnChain = chainIds.has(left.id) ? 0 : 1;
    const rightOnChain = chainIds.has(right.id) ? 0 : 1;
    if (leftOnChain !== rightOnChain) {
      return leftOnChain - rightOnChain;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  };

  /** @returns How many columns the tree under `member` spans. */
  const treeSpan = (member: RailMemberInput): number => {
    let span = (depths.get(member.id) ?? 0) + 1;
    for (const child of children.get(member.id) ?? []) {
      span = Math.max(span, treeSpan(child));
    }
    return span;
  };

  /** @returns The most recent `updatedAt` anywhere in the tree under `member`. */
  const treeNewest = (member: RailMemberInput): string => {
    let newest = member.updatedAt;
    for (const child of children.get(member.id) ?? []) {
      const childNewest = treeNewest(child);
      if (childNewest > newest) {
        newest = childNewest;
      }
    }
    return newest;
  };

  /** @returns The id of the tree root `id` descends from. */
  const rootIdOf = (id: string): string => {
    const parentId = parents.get(id) ?? null;
    return parentId === null ? id : rootIdOf(parentId);
  };
  const currentRootId = rootIdOf(currentId);
  roots.sort((left, right) => {
    // Newest tree right-most. On a tie the open deck's tree goes last, so the
    // eye lands on it; the id keeps the rest of the order stable.
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

  const nodes: RailNode[] = [];
  const laneEnd: number[] = [];
  /** @returns The row this node can occupy, reusing `preferred` when it is free. */
  const claimLane = (preferred: number | null, x: number): number => {
    if (preferred !== null && (laneEnd[preferred] ?? -1) < x) {
      return preferred;
    }
    let lane = 0;
    while ((laneEnd[lane] ?? -1) >= x) {
      lane += 1;
    }
    return lane;
  };

  const place = (
    member: RailMemberInput,
    preferredLane: number | null,
    columnOffset: number,
  ): void => {
    const x = columnOffset + (depths.get(member.id) ?? 0);
    const lane = claimLane(preferredLane, x);
    laneEnd[lane] = x;
    nodes.push({
      id: member.id,
      label: railLabel(member.name, current.name),
      fullName: member.name,
      isCurrent: member.id === currentId,
      isDraft: member.isDraft,
      lane,
      x,
    });
    const descendants = (children.get(member.id) ?? []).toSorted(byDescent);
    descendants.forEach((child, index) => {
      // The first child continues its parent's row; a fork starts a new one.
      place(child, index === 0 ? lane : null, columnOffset);
    });
  };

  // Each tree starts where the previous one ended, so lane 0 is free again at
  // that column and every root lands on it.
  let nextColumn = 0;
  for (const root of roots) {
    place(root, 0, nextColumn);
    nextColumn += treeSpan(root);
  }

  const drawnIds = new Set(nodes.map((node) => node.id));
  const edges: RailEdge[] = [];
  for (const node of nodes) {
    const parentId = parents.get(node.id) ?? null;
    if (parentId !== null && drawnIds.has(parentId)) {
      edges.push({ fromId: parentId, toId: node.id });
    }
  }

  return { nodes, edges, overflowCount };
}
