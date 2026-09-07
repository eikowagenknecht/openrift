import type {
  MetaEventMatch,
  MetaEventPhase,
  MetaEventPlayer,
} from "@openrift/shared/types/api/meta";

import { Heading } from "@/components/heading";
import { Card } from "@/components/ui/card";
import { accentGlow, Medal } from "@/components/ui/podium";
import { MetaIdentity } from "@/features/meta/components/meta-identity";
import { MetaPlayerName } from "@/features/meta/components/meta-player-name";
import type {
  MetaBracketMatch,
  MetaBracketRound,
  MetaBracketSeat,
} from "@/features/meta/lib/meta-bracket";
import { metaEventBracket } from "@/features/meta/lib/meta-bracket";
import { cn } from "@/lib/utils";

const FINAL_GLOW = accentGlow(12);

const SEAT_NAME_CLASS = "min-w-0 flex-1 truncate";

function SeatName({
  seat,
  player,
}: {
  seat: MetaBracketSeat;
  player: MetaEventPlayer | undefined;
}) {
  if (player === undefined) {
    return <span className={SEAT_NAME_CLASS}>{seat.playerId === null ? "Bye" : "Unknown"}</span>;
  }
  return (
    <MetaPlayerName
      name={player.playerName}
      playerKey={player.playerKey}
      className={SEAT_NAME_CLASS}
    />
  );
}

function Seat({ seat, player }: { seat: MetaBracketSeat; player: MetaEventPlayer | undefined }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-sm not-last:border-b",
        seat.isWinner ? "font-semibold" : "text-muted-foreground",
      )}
    >
      {player === undefined ? <span className="size-5 shrink-0" /> : <Medal rank={player.rank} />}
      <SeatName seat={seat} player={player} />
      <MetaIdentity
        name={player?.legend?.name}
        championOnly
        className="text-muted-foreground hidden shrink-0 text-xs sm:flex"
      />
      <span className="font-heading w-4 text-right tabular-nums">{seat.gamesWon ?? "–"}</span>
    </div>
  );
}

function BracketMatch({
  match,
  players,
  isFinal,
}: {
  match: MetaBracketMatch;
  players: ReadonlyMap<string, MetaEventPlayer>;
  isFinal: boolean;
}) {
  return (
    <Card
      className={cn("gap-0 py-0", isFinal && "ring-border-accent/50")}
      style={isFinal ? { backgroundImage: FINAL_GLOW } : undefined}
    >
      {match.seats.map((seat, index) => (
        <Seat
          key={`${match.key}:${index}`}
          seat={seat}
          player={seat.playerId === null ? undefined : players.get(seat.playerId)}
        />
      ))}
    </Card>
  );
}

function Round({
  round,
  players,
}: {
  round: MetaBracketRound;
  players: ReadonlyMap<string, MetaEventPlayer>;
}) {
  return (
    <div className="flex flex-col justify-center gap-2.5">
      <span className="text-muted-foreground text-xs font-semibold">{round.label}</span>
      {round.matches.map((match) => (
        <BracketMatch key={match.key} match={match} players={players} isFinal={round.isFinal} />
      ))}
    </div>
  );
}

export function MetaEventBracket({
  matches,
  phases,
  players,
}: {
  matches: readonly MetaEventMatch[];
  phases: readonly MetaEventPhase[];
  players: readonly MetaEventPlayer[];
}) {
  const bracket = metaEventBracket(matches, phases);
  if (bracket === null) {
    return null;
  }

  const byId = new Map(players.map((player) => [player.id, player]));

  return (
    <section className="mt-8">
      <Heading className="mb-3">{bracket.title}</Heading>
      {/* flex-col-reverse renders the rounds final-first on phones without duplicate markup. */}
      <div
        className="flex flex-col-reverse gap-4 lg:grid lg:gap-5"
        style={{ gridTemplateColumns: `repeat(${bracket.rounds.length}, minmax(0, 1fr))` }}
      >
        {bracket.rounds.map((round) => (
          <Round key={round.label} round={round} players={byId} />
        ))}
      </div>
    </section>
  );
}
