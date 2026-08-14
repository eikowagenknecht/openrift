import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type { MetaStatsResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StatRow = MetaStatsResponse["cards"][number];

/** How many rows each panel shows before the list stops being useful. */
const CARD_ROW_LIMIT = 25;
const LEGEND_ROW_LIMIT = 12;

function inclusionPercent(deckCount: number, totalDecks: number): number {
  return totalDecks > 0 ? (deckCount / totalDecks) * 100 : 0;
}

/**
 * A stat row's card name, linking to its card page. The stats payload carries
 * the slug, so the link works without pulling the catalog onto the page.
 * @returns The linked card name.
 */
function StatCardName({ row }: { row: StatRow }) {
  return (
    <Link
      to="/cards/$cardSlug"
      params={{ cardSlug: row.slug }}
      className="truncate hover:underline"
    >
      {row.name}
    </Link>
  );
}

/**
 * A stat row's thumbnail. The payload carries the card's orientation, so a
 * Battlefield's landscape art is rotated into the frame instead of cropped to
 * a strip.
 * @returns The thumbnail element.
 */
function StatThumb({ row, className }: { row: StatRow; className: string }) {
  return (
    <CardArtThumb
      imageId={row.imageId}
      landscape={row.landscape}
      loading="lazy"
      className={className}
    />
  );
}

function PercentBar({ percent }: { percent: number }) {
  return (
    <ProgressPrimitive.Root value={Math.min(percent, 100)} className="block flex-1">
      <ProgressTrack className="h-1.5">
        <ProgressIndicator className="rounded-full" />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
}

/**
 * The card-inclusion table: what share of the archived decks in scope play each
 * card.
 *
 * The denominator is the decks whose main deck the archive actually holds, not
 * every deck in scope: an archetype-only entry names a legend and nothing else,
 * so counting it would deflate every card's share. The sub-line names that
 * number whenever the two differ, so the gap is visible rather than silent.
 *
 * @returns The table, or an empty note when nothing is in scope.
 */
function CardInclusionPanel({
  rows,
  decksWithMainDeck,
  totalDecks,
}: {
  rows: StatRow[];
  decksWithMainDeck: number;
  totalDecks: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, CARD_ROW_LIMIT);
  const subLine =
    decksWithMainDeck === totalDecks
      ? "Main decks only."
      : `Main decks only, across the ${decksWithMainDeck} of ${totalDecks} decks with a known list.`;
  return (
    <section>
      <Heading>Most played cards</Heading>
      <p className="text-muted-foreground mb-2 text-sm">{subLine}</p>
      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyDescription>No cards to count yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Card art</span>
                </TableHead>
                <TableHead>Card</TableHead>
                <TableHead className="w-40">Inclusion</TableHead>
                <TableHead className="w-16 text-right">Decks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.cardId}>
                  <TableCell>
                    <StatThumb row={row} className="w-8" />
                  </TableCell>
                  <TableCell className="max-w-0">
                    <StatCardName row={row} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <PercentBar percent={inclusionPercent(row.deckCount, decksWithMainDeck)} />
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums">
                        {inclusionPercent(row.deckCount, decksWithMainDeck).toFixed(0)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.deckCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length > CARD_ROW_LIMIT ? (
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => setShowAll(!showAll)}>
              {showAll ? `Show top ${CARD_ROW_LIMIT}` : `Show all ${rows.length} cards`}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

/**
 * The legend play-rate panel. Legends are the archive's grouping axis, so this
 * is the more visual of the two panels: art, name, share.
 * @returns The panel, or an empty note when nothing is in scope.
 */
function LegendPlayRatePanel({ rows, totalDecks }: { rows: StatRow[]; totalDecks: number }) {
  return (
    <section>
      <Heading className="mb-2">Top legends</Heading>
      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyDescription>No legends to count yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.slice(0, LEGEND_ROW_LIMIT).map((row) => (
            <li key={row.cardId} className="flex items-center gap-3">
              <StatThumb row={row} className="w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline justify-between gap-2">
                  <StatCardName row={row} />
                  <span className="shrink-0 text-xs tabular-nums">
                    {inclusionPercent(row.deckCount, totalDecks).toFixed(0)}% · {row.deckCount}
                  </span>
                </div>
                <div className="mt-1 flex">
                  <PercentBar percent={inclusionPercent(row.deckCount, totalDecks)} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The two meta aggregates side by side (ADR-014). Renders entirely from the
 * stats payload, so the whole section is server-rendered and crawlable.
 * @returns The stats section.
 */
export function MetaStatsPanels({ stats }: { stats: MetaStatsResponse }) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <CardInclusionPanel
        rows={stats.cards}
        decksWithMainDeck={stats.decksWithMainDeck}
        totalDecks={stats.totalDecks}
      />
      {/* Every deck names its legend whatever its list status, so this half
          counts the whole archive in scope. */}
      <LegendPlayRatePanel rows={stats.legends} totalDecks={stats.totalDecks} />
    </div>
  );
}
