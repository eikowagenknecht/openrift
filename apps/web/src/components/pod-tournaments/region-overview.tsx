import type { PodStandingRow } from "@openrift/shared";

import { SectionHeading } from "@/components/ui/section-heading";
import { computeRegionOverview } from "@/lib/region-overview";

import { formatScore } from "./standings-display";

// Default region label: the raw slug (named so the React Compiler can reorder it).
const rawRegionSlug = (slug: string): string => slug;

/**
 * The fill width for a region's bar, as a share of the leading region's
 * average. The comparison is what the number means, so the top region always
 * fills the track and the rest read against it. A leading average of zero (no
 * scores yet) leaves every track empty rather than dividing by nothing.
 *
 * @param avgScore The region's average points.
 * @param topAvgScore The leading region's average points.
 * @returns The fill width as a CSS percentage.
 */
function barWidth(avgScore: number, topAvgScore: number): string {
  if (topAvgScore <= 0) {
    return "0%";
  }
  return `${Math.max(0, (avgScore / topAvgScore) * 100)}%`;
}

/**
 * The region leaderboard: regions ranked by the average points of their
 * players, as bars against the leading region. Renders nothing while no player
 * has a region yet.
 *
 * @returns The region overview, or null.
 */
export function RegionOverview({
  standings,
  regionLabel = rawRegionSlug,
}: {
  standings: PodStandingRow[];
  regionLabel?: (slug: string) => string;
}) {
  const { rows, unassignedCount } = computeRegionOverview(standings);
  if (rows.length === 0) {
    return null;
  }
  const topAvgScore = rows[0].avgScore;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading as="h3" count={rows.length}>
        Regions
      </SectionHeading>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.region} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-medium">{regionLabel(row.region)}</span>
              <span className="text-muted-foreground shrink-0 text-sm">
                <span className="text-foreground font-semibold tabular-nums">
                  {formatScore(row.avgScore)}
                </span>{" "}
                avg · {row.playerCount} player{row.playerCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-border-accent h-full rounded-full"
                style={{ width: barWidth(row.avgScore, topAvgScore) }}
              />
            </div>
          </li>
        ))}
      </ul>
      {unassignedCount > 0 ? (
        <p className="text-muted-foreground text-sm">
          {unassignedCount} player{unassignedCount === 1 ? "" : "s"} without a region.
        </p>
      ) : null}
    </section>
  );
}
