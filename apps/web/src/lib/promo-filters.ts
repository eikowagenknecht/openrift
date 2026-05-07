import type { DistributionChannelWithCount, Printing } from "@openrift/shared";

import type { ChannelNode } from "./promos-tree";
import { buildPromoTree } from "./promos-tree";

/**
 * Group already-filtered printings under each channel they link to, then build
 * a fresh channel tree from those groupings. Pure transform — does not apply
 * filters itself; the caller is expected to pass filterCards-narrowed input.
 * @returns The channel tree built over the matched printings.
 */
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
