import type { DistributionChannelResponse } from "@openrift/shared";

export interface ChannelTreeNode {
  channel: DistributionChannelResponse;
  depth: number;
  /** Ordered ids from root → this node (inclusive). */
  ancestorIds: string[];
  /** Labels along the breadcrumb path, joined with " › ". */
  breadcrumb: string;
  /** Whether this channel has at least one child. */
  hasChildren: boolean;
}

const SEP = " \u203A ";

/**
 * Sort channels into tree-traversal order (root, then each subtree DFS),
 * decorating each row with depth, ancestor ids, and breadcrumb label.
 *
 * Sibling order within each parent group is sortOrder, then label.
 *
 * @returns Channels in DFS order with tree metadata attached.
 */
export function buildChannelTree(channels: DistributionChannelResponse[]): ChannelTreeNode[] {
  const byParent = new Map<string | null, DistributionChannelResponse[]>();
  for (const ch of channels) {
    const key = ch.parentId;
    const list = byParent.get(key);
    if (list) {
      list.push(ch);
    } else {
      byParent.set(key, [ch]);
    }
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }

  const out: ChannelTreeNode[] = [];
  function walk(parentId: string | null, depth: number, ancestorIds: string[], crumbs: string[]) {
    const siblings = byParent.get(parentId);
    if (!siblings) {
      return;
    }
    for (const channel of siblings) {
      const nextAncestors = [...ancestorIds, channel.id];
      const nextCrumbs = [...crumbs, channel.label];
      out.push({
        channel,
        depth,
        ancestorIds: nextAncestors,
        breadcrumb: nextCrumbs.join(SEP),
        hasChildren: byParent.has(channel.id),
      });
      walk(channel.id, depth + 1, nextAncestors, nextCrumbs);
    }
  }
  walk(null, 0, [], []);
  return out;
}

/**
 * Whether `candidateParentId` would be a valid new parent for `channel`. Rejects
 * self, descendants of self (cycles), and parents whose kind disagrees.
 *
 * @returns True when reparenting under `candidateParentId` is allowed.
 */
export function canReparent(
  channel: DistributionChannelResponse,
  candidateParentId: string | null,
  tree: ChannelTreeNode[],
): boolean {
  if (candidateParentId === null) {
    return true;
  }
  if (candidateParentId === channel.id) {
    return false;
  }
  const candidate = tree.find((n) => n.channel.id === candidateParentId);
  if (!candidate) {
    return false;
  }
  if (candidate.channel.kind !== channel.kind) {
    return false;
  }
  return !candidate.ancestorIds.includes(channel.id);
}

/**
 * Channels with no children. Printings can only link to leaves.
 *
 * @returns Subset of `tree` containing only leaf nodes.
 */
export function leafChannels(tree: ChannelTreeNode[]): ChannelTreeNode[] {
  return tree.filter((n) => !n.hasChildren);
}
