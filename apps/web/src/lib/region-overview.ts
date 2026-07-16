// The region leaderboard ("Regionen-Punkte"): regions ranked by the average
// points of their players. Derived client-side from the standings rows, which
// already carry each player's score and region.

export interface RegionOverviewRow {
  /** The region tag slug (label lookup is the caller's job). */
  region: string;
  playerCount: number;
  /** Average tournament points across the region's players. */
  avgScore: number;
}

export interface RegionOverview {
  /** One row per assigned region, best average first. */
  rows: RegionOverviewRow[];
  /** Players without a region, excluded from the rows. */
  unassignedCount: number;
}

/**
 * Group standings rows by region and rank regions by average member points
 * (then player count, then slug for a stable order). Rows without a region are
 * counted separately, never averaged into a region.
 *
 * @param standings The standings rows (score + region is all that's read).
 * @returns The ranked region rows plus the unassigned count.
 */
/**
 * Build a region slug -> display label lookup from the `region` custom-tag
 * vocabulary. Falls back to the raw slug for tags deleted after assignment.
 *
 * @param tags The region-category custom tags (slug + label).
 * @returns The label lookup function.
 */
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
