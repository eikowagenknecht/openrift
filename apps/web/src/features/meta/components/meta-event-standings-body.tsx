import type { MetaEventPlayer } from "@openrift/shared/types/api/meta";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DesktopRow, PhoneRow } from "@/features/meta/components/meta-event-standings-rows";
import { useRowWindow } from "@/features/meta/hooks/use-standings-row-window";
import type { MetaDeckCost } from "@/features/meta/lib/meta-deck-collection";
import type { StandingsColumns } from "@/features/meta/lib/meta-event-standings";
import type { MetaPlayerRound } from "@/features/meta/lib/meta-player-run";

export interface StandingsBodyProps {
  players: readonly MetaEventPlayer[];
  slug: string;
  canSubmit: boolean;
  columns: StandingsColumns;
  costs: ReadonlyMap<string, MetaDeckCost> | undefined;
  rounds: ReadonlyMap<string, readonly MetaPlayerRound[]>;
  expandedId: string | null;
  onToggle: (id: string) => void;
}

export function DesktopStandings({
  players,
  slug,
  canSubmit,
  columns,
  costs,
  rounds,
  expandedId,
  onToggle,
}: StandingsBodyProps) {
  const { containerRef, height, rows } = useRowWindow(players);

  return (
    <div className="hidden md:block">
      <Table className="block">
        <TableHeader className="block">
          <TableRow className="flex w-full">
            <TableHead className="flex w-20 shrink-0 items-center justify-center">Rank</TableHead>
            {columns.legend && (
              <TableHead className="flex w-64 shrink-0 items-center">Legend</TableHead>
            )}
            <TableHead className="flex min-w-0 flex-1 items-center">Player</TableHead>
            {columns.run && <TableHead className="flex w-52 shrink-0 items-center">Run</TableHead>}
            {columns.value && (
              <TableHead className="flex w-28 shrink-0 items-center justify-end">Value</TableHead>
            )}
            {columns.deck && (
              <TableHead className="flex w-36 shrink-0 items-center justify-end">
                Decklist
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody ref={containerRef} className="relative block" style={{ height }}>
          {rows.map(({ player, slot }) => (
            <DesktopRow
              key={player.id}
              {...slot}
              player={player}
              slug={slug}
              canSubmit={canSubmit}
              columns={columns}
              costs={costs}
              rounds={rounds.get(player.id)}
              expanded={expandedId === player.id}
              onToggle={() => onToggle(player.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function PhoneStandings({
  players,
  slug,
  canSubmit,
  columns,
  costs,
  rounds,
  expandedId,
  onToggle,
}: StandingsBodyProps) {
  const { containerRef, height, rows } = useRowWindow(players);

  return (
    <ul ref={containerRef} className="relative block md:hidden" style={{ height }}>
      {rows.map(({ player, slot }) => (
        <PhoneRow
          key={player.id}
          {...slot}
          player={player}
          slug={slug}
          canSubmit={canSubmit}
          columns={columns}
          costs={costs}
          rounds={rounds.get(player.id)}
          expanded={expandedId === player.id}
          onToggle={() => onToggle(player.id)}
        />
      ))}
    </ul>
  );
}
