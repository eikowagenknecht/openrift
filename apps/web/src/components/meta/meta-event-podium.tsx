import type { MetaEventPlayer } from "@openrift/shared";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { MetaIdentity } from "@/components/meta/meta-identity";
import { Medal, SEAT_GLOW, seatOrder } from "@/components/ui/podium";
import { formatRecord } from "@/lib/meta-format";
import { cn } from "@/lib/utils";

const SEAT_COLUMNS: Record<number, string> = {
  1: "max-w-40 grid-cols-1",
  2: "max-w-md grid-cols-2",
  3: "grid-cols-3",
};

function Seat({ player, raised }: { player: MetaEventPlayer; raised: boolean }) {
  const record = formatRecord(player.wins, player.losses, player.draws);
  const artImageId = player.legend?.imageId ?? player.champion?.imageId ?? null;

  return (
    <div
      data-slot="meta-podium-seat"
      data-raised={raised}
      className={cn(
        "bg-muted/40 flex min-w-0 flex-col items-center gap-1 rounded-lg px-1.5 text-center",
        raised ? "ring-border-accent/40 py-4 ring-1" : "py-3",
      )}
      style={raised ? { backgroundImage: SEAT_GLOW } : undefined}
    >
      <Medal rank={player.rank} />
      <CardArtThumb
        imageId={artImageId}
        loading="lazy"
        domains={player.legend?.domains}
        className={raised ? "w-16 sm:w-20" : "w-12 sm:w-16"}
      />
      <span className="w-full truncate text-sm font-medium">{player.playerName}</span>
      {record !== null && (
        <span
          className={cn(
            "font-heading font-bold tabular-nums",
            raised ? "text-border-accent text-2xl sm:text-3xl" : "text-lg sm:text-2xl",
          )}
        >
          {record}
        </span>
      )}
      <MetaIdentity
        name={player.legend?.name}
        domains={player.legend?.domains}
        className="text-muted-foreground justify-center text-xs"
      />
    </div>
  );
}

/**
 * The top three of an archived event, seated with legend card art in place of
 * avatars: an archived player has no account behind them, and the deck they
 * piloted is what a reader came for. Built from `ui/podium.tsx`'s medal, seat
 * glow and seat order rather than from `Podium` itself, whose avatar, points
 * score and tie-break hint are all the wrong slots here.
 *
 * Renders nothing when the standings have not arrived. The tournament throne's
 * ghost seats exist because a live event will fill them; an archived event with
 * no results is waiting on a source, and the standings section says so once.
 */
export function MetaEventPodium({ players }: { players: readonly MetaEventPlayer[] }) {
  const seats = players.slice(0, 3);
  if (seats.length === 0) {
    return null;
  }

  return (
    <div
      data-slot="meta-event-podium"
      className={cn("mx-auto grid w-full max-w-xl items-end gap-2", SEAT_COLUMNS[seats.length])}
    >
      {seatOrder(seats).map((player) => (
        <Seat key={player.id} player={player} raised={player.id === seats[0].id} />
      ))}
    </div>
  );
}
