import type { MetaEventMatch, MetaEventPhase, MetaEventPlayer } from "@openrift/shared";

import { Heading } from "@/components/heading";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { accentGlow, Medal } from "@/components/ui/podium";
import type { MetaBracketMatch, MetaBracketRound, MetaBracketSeat } from "@/lib/meta-bracket";
import { metaEventBracket } from "@/lib/meta-bracket";
import { cn } from "@/lib/utils";

/** The final's card wears the archive's winning colour, quieter than a podium seat. */
const FINAL_GLOW = accentGlow(12);

function Seat({
  seat,
  player,
  showMedal,
}: {
  seat: MetaBracketSeat;
  player: MetaEventPlayer | undefined;
  showMedal: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-sm not-last:border-b",
        seat.isWinner ? "font-semibold" : "text-muted-foreground",
      )}
    >
      {showMedal && (seat.isWinner ? <Medal rank={1} /> : <span className="size-5 shrink-0" />)}
      {/* A seat with no player id is a bye; one whose standings row the archive
          does not hold is a gap in the record, and saying "Bye" would be wrong
          about what happened. */}
      <span className="min-w-0 flex-1 truncate">
        {seat.playerId === null ? "Bye" : (player?.playerName ?? "Unknown")}
      </span>
      {/* The compact bracket is the one surface allowed the champion alone: a
          full "Kennen · Heart of the Tempest" does not fit a bracket cell. */}
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
    <div
      className={cn(
        "bg-card flex flex-col overflow-hidden rounded-lg ring-1",
        isFinal ? "ring-border-accent/50" : "ring-foreground/10",
      )}
      style={isFinal ? { backgroundImage: FINAL_GLOW } : undefined}
    >
      {match.seats.map((seat, index) => (
        <Seat
          key={`${match.key}:${index}`}
          seat={seat}
          player={seat.playerId === null ? undefined : players.get(seat.playerId)}
          showMedal={isFinal}
        />
      ))}
    </div>
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

/**
 * The top cut as a bracket, one column per round.
 *
 * Phones read it final first: a bracket's point is who won, and a vertical list
 * that opens on the quarterfinals buries that under eight rows. Desktop keeps
 * the left-to-right progression the rounds actually ran in.
 *
 * Renders nothing when the event's matches record no cut — most of the archive
 * is standings without pairings, and the page is complete without this section.
 */
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
      {/* `flex-col-reverse` is what turns the rounds final-first on phones,
          without a second copy of the markup to keep in step. */}
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
