import { formatAbsoluteDate } from "@/lib/format-date";

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
  /** 0 = the open deck's ancestry chain, 1 = everything else. */
  lane: 0 | 1;
  /**
   * Horizontal slot, in chain steps. Chain nodes sit at whole slots; a branch
   * node sits at its anchor's slot + 0.75 so the fork reads as "after" it.
   */
  x: number;
}

export interface RailEdge {
  /** The older end (the predecessor). */
  fromId: string;
  toId: string;
  /** chain = along lane 0; branch = lane 0 down to lane 1. */
  kind: "chain" | "branch";
}

export interface RailLayout {
  nodes: RailNode[];
  edges: RailEdge[];
  /** Family members that didn't fit; the rail shows them as "+N more". */
  overflowCount: number;
}

const MAX_LABEL_CHARS = 18;
const ISO_DATE_SUFFIX = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * The rail's one naming rule: show the member's name minus what it shares
 * with the family. A name of the form `<base> (<rest>)` collapses to `<rest>`;
 * when the rest is a bare ISO date (the default checkpoint name) it renders as
 * a short date instead, with the year kept only when it isn't `referenceYear`.
 * Anything else shows as-is. Labels are capped at {@link MAX_LABEL_CHARS}.
 *
 * @returns The label to draw at the node.
 */
export function railLabel(name: string, familyBaseName: string, referenceYear: number): string {
  let label = name;
  const prefix = `${familyBaseName} (`;
  if (name.startsWith(prefix) && name.endsWith(")")) {
    const rest = name.slice(prefix.length, -1);
    if (rest.length > 0) {
      label = rest;
    }
  }
  if (ISO_DATE_SUFFIX.test(label)) {
    // Date-only strings format in UTC (formatAbsoluteDate's default), so the
    // calendar day never shifts with the viewer's timezone.
    const withYear = Number(label.slice(0, 4)) !== referenceYear;
    label = formatAbsoluteDate(label, {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    });
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
 * Lays out a family as rail nodes and edges. Lane 0 is the open deck's
 * ancestry chain, oldest at slot 0. Every other member goes to lane 1, newest
 * first: anchored after its predecessor when that predecessor is on the chain
 * (with a branch edge), otherwise unanchored at the left (no edge), which is
 * how members linked without lineage render. When the family exceeds
 * `maxNodes`, chain nodes win and the newest siblings fill what's left.
 *
 * @returns The computed layout.
 */
export function buildRailLayout(
  members: readonly RailMemberInput[],
  currentId: string,
  referenceYear: number,
  maxNodes = 6,
): RailLayout {
  const byId = new Map(members.map((member) => [member.id, member]));
  const current = byId.get(currentId);
  if (!current) {
    return { nodes: [], edges: [], overflowCount: 0 };
  }

  const chain = ancestryChain(byId, currentId);
  const chainIndex = new Map(chain.map((member, index) => [member.id, index]));
  const rest = members
    .filter((member) => !chainIndex.has(member.id))
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const keptChain = chain.length > maxNodes ? chain.slice(chain.length - maxNodes) : chain;
  const keptChainIndex = new Map(keptChain.map((member, index) => [member.id, index]));
  const siblingBudget = Math.max(0, maxNodes - keptChain.length);
  const keptRest = rest.slice(0, siblingBudget);
  const overflowCount = chain.length - keptChain.length + (rest.length - keptRest.length);

  const nodes: RailNode[] = [];
  const edges: RailEdge[] = [];
  const usedSiblingSlots = new Set<number>();

  for (const member of keptChain) {
    const index = keptChainIndex.get(member.id) ?? 0;
    nodes.push({
      id: member.id,
      label: railLabel(member.name, current.name, referenceYear),
      fullName: member.name,
      isCurrent: member.id === currentId,
      isDraft: member.isDraft,
      lane: 0,
      x: index,
    });
    const predecessorId = member.predecessorDeckId;
    if (predecessorId && keptChainIndex.has(predecessorId)) {
      edges.push({ fromId: predecessorId, toId: member.id, kind: "chain" });
    }
  }

  for (const member of keptRest) {
    const anchorIndex = member.predecessorDeckId
      ? keptChainIndex.get(member.predecessorDeckId)
      : undefined;
    let slot = anchorIndex === undefined ? 0 : anchorIndex;
    while (usedSiblingSlots.has(slot)) {
      slot += 1;
    }
    usedSiblingSlots.add(slot);
    nodes.push({
      id: member.id,
      label: railLabel(member.name, current.name, referenceYear),
      fullName: member.name,
      isCurrent: false,
      isDraft: member.isDraft,
      lane: 1,
      x: slot + 0.75,
    });
    if (anchorIndex !== undefined && member.predecessorDeckId) {
      edges.push({ fromId: member.predecessorDeckId, toId: member.id, kind: "branch" });
    }
  }

  return { nodes, edges, overflowCount };
}
