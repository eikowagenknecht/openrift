import type { DistributionChannelWithCount, Printing } from "@openrift/shared";

import type { ChannelNode } from "./promos-tree";
import { buildPromoTree } from "./promos-tree";

export function buildPromoTreeFromMatches(
  matched: Printing[],
  channels: DistributionChannelWithCount[],
): ChannelNode[] {
  const perChannel = new Map<string, Printing[]>();
  for (const printing of matched) {
    for (const link of printing.distributionChannels) {
      const list = perChannel.get(link.channel.id);
      if (list) {
        list.push(printing);
      } else {
        perChannel.set(link.channel.id, [printing]);
      }
    }
  }
  return buildPromoTree(channels, perChannel);
}
