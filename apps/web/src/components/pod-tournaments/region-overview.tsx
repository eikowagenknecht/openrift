import type { PodStandingRow } from "@openrift/shared";

import { Heading } from "@/components/heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computeRegionOverview } from "@/lib/region-overview";

import { formatScore } from "./standings-table";

// Default region label: the raw slug (named so the React Compiler can reorder it).
const rawRegionSlug = (slug: string): string => slug;

/**
 * The region leaderboard: regions ranked by the average points of their players.
 * Renders nothing while no player has a region yet.
 * @returns The region overview table, or null.
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
  return (
    <section className="flex flex-col gap-2">
      <Heading as="h3">Regions</Heading>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Region</TableHead>
            <TableHead className="text-right">Players</TableHead>
            <TableHead className="text-right">Ø Points</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.region}>
              <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
              <TableCell className="font-medium">{regionLabel(row.region)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.playerCount}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {formatScore(row.avgScore)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {unassignedCount > 0 ? (
        <p className="text-muted-foreground text-sm">
          {unassignedCount} player{unassignedCount === 1 ? "" : "s"} without a region.
        </p>
      ) : null}
    </section>
  );
}
