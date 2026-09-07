interface RegionOverviewRow {
  region: string;
  playerCount: number;
  avgScore: number;
}

export interface RegionOverview {
  rows: RegionOverviewRow[];
  unassignedCount: number;
}

export function regionLabelFromTags(
  tags: readonly { slug: string; label: string }[],
): (slug: string) => string {
  const labelBySlug = new Map(tags.map((tag) => [tag.slug, tag.label]));
  return (slug: string) => labelBySlug.get(slug) ?? slug;
}

export function computeRegionOverview(
  standings: readonly { region: string | null; score: number }[],
): RegionOverview {
  const byRegion = new Map<string, { sum: number; count: number }>();
  let unassignedCount = 0;
  for (const row of standings) {
    if (row.region === null) {
      unassignedCount += 1;
      continue;
    }
    const entry = byRegion.get(row.region) ?? { sum: 0, count: 0 };
    entry.sum += row.score;
    entry.count += 1;
    byRegion.set(row.region, entry);
  }
  const rows = [...byRegion.entries()]
    .map(([region, { sum, count }]) => ({
      region,
      playerCount: count,
      avgScore: sum / count,
    }))
    .toSorted(
      (a, b) =>
        b.avgScore - a.avgScore ||
        b.playerCount - a.playerCount ||
        a.region.localeCompare(b.region),
    );
  return { rows, unassignedCount };
}
