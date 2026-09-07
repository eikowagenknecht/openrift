import type { DistributionChannelResponse } from "@openrift/shared/types/api/admin";

export interface ChannelLike {
  id: string;
  slug: string;
  label: string;
  parentId: string | null;
  sortOrder?: number;
}

export interface ChannelTreeNode<T extends ChannelLike = DistributionChannelResponse> {
  channel: T;
  depth: number;
  ancestorIds: string[];
  breadcrumb: string;
  hasChildren: boolean;
}

const SEP = " › ";

export function buildChannelTree<T extends ChannelLike>(channels: T[]): ChannelTreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
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
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label));
  }

  const out: ChannelTreeNode<T>[] = [];
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

/** Printings can only link to leaves. */
export function leafChannels<T extends ChannelLike>(
  tree: ChannelTreeNode<T>[],
): ChannelTreeNode<T>[] {
  return tree.filter((n) => !n.hasChildren);
}
