import type { DistributionChannelResponse } from "@openrift/shared/types/api/admin";

import type { ChannelLike } from "@/features/cards/lib/distribution-channel-tree";
import { buildChannelTree } from "@/features/cards/lib/distribution-channel-tree";

export interface ChannelBrowseRow<T extends ChannelLike = DistributionChannelResponse> {
  channel: T;
  depth: number;
  breadcrumb: string;
  ancestorIds: string[];
  rootId: string;
  isLeaf: boolean;
}

export function buildChannelBrowseRows<T extends ChannelLike>(
  channels: readonly T[],
): ChannelBrowseRow<T>[] {
  return buildChannelTree([...channels]).map((node) => ({
    channel: node.channel,
    depth: node.depth,
    breadcrumb: node.breadcrumb,
    ancestorIds: node.ancestorIds,
    rootId: node.ancestorIds.at(0) ?? node.channel.id,
    isLeaf: !node.hasChildren,
  }));
}

export function filterChannelBrowseRows<T extends ChannelLike>(
  rows: readonly ChannelBrowseRow<T>[],
  query: string,
): ChannelBrowseRow<T>[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [...rows];
  }
  const keep = new Set<string>();
  for (const row of rows) {
    const matches =
      row.channel.label.toLowerCase().includes(needle) ||
      row.breadcrumb.toLowerCase().includes(needle);
    if (matches) {
      for (const id of row.ancestorIds) {
        keep.add(id);
      }
    }
  }
  return rows.filter((row) => keep.has(row.channel.id));
}
