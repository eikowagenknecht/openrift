import type { DistributionChannel } from "@openrift/shared";

const SEP = " › ";

export function buildChannelBreadcrumbs(
  channels: readonly DistributionChannel[],
): Map<string, string> {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const cache = new Map<string, string>();

  function pathFor(channel: DistributionChannel): string {
    const cached = cache.get(channel.id);
    if (cached !== undefined) {
      return cached;
    }
    const labels: string[] = [channel.label];
    let cursor = channel.parentId ? byId.get(channel.parentId) : undefined;
    const seen = new Set<string>([channel.id]);
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      labels.unshift(cursor.label);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    const path = labels.join(SEP);
    cache.set(channel.id, path);
    return path;
  }

  for (const channel of channels) {
    pathFor(channel);
  }
  return cache;
}

export function buildChannelBreadcrumbsBySlug(
  channels: readonly DistributionChannel[],
): Map<string, string> {
  const byId = buildChannelBreadcrumbs(channels);
  const result = new Map<string, string>();
  for (const channel of channels) {
    result.set(channel.slug, byId.get(channel.id) ?? channel.label);
  }
  return result;
}
