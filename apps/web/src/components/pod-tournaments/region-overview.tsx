import type { PodStandingRow } from "@openrift/shared/types/api/pod-tournament";

import { SectionHeading } from "@/components/ui/section-heading";
import { computeRegionOverview } from "@/lib/region-overview";

import { formatScore } from "./standings-display";

// Named so the React Compiler can reorder it.
const rawRegionSlug = (slug: string): string => slug;

// Guards against dividing by zero: a zero leading average leaves every track empty.
function barWidth(avgScore: number, topAvgScore: number): string {
  if (topAvgScore <= 0) {
    return "0%";
  }
  return `${Math.max(0, (avgScore / topAvgScore) * 100)}%`;
}

/**
 * The region leaderboard: regions ranked by average points, as bars against
 * the leading region. Renders nothing while no player has a region yet.
 */
export function RegionOverview({
  standings,
  regionLabel = rawRegionSlug,
}: {
  standings: PodStandingRow[];
  regionLabel?: (slug: string) => string;
}) {
  const { rows, unassignedCount } = computeRegionOverview(standings);
  const [leadingRow] = rows;
  if (leadingRow === undefined) {
    return null;
  }
  const topAvgScore = leadingRow.avgScore;
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
