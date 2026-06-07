import { CrownIcon, FlagIcon, MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TEAM_CHIP, TEAM_LABELS, TEAM_PANEL_BORDER } from "@/lib/match-teams";
import { cn } from "@/lib/utils";
import { useMatchTrackerStore } from "@/stores/match-tracker-store";

/**
 * One player's scorepad. Subscribes to only its own slice of the store so a
 * counter tap on one panel never re-renders the others (per the per-row
 * selector convention in docs/contributing.md).
 * @returns The player panel, or null if the id is no longer in the roster.
 */
export function PlayerPanel({ playerId, rotated }: { playerId: string; rotated: boolean }) {
  const player = useMatchTrackerStore((state) => state.players.find((p) => p.id === playerId));
  const pointsTarget = useMatchTrackerStore((state) => state.pointsTarget);
  const teamsActive = useMatchTrackerStore((state) => state.mode === "teams");
  const isFirst = useMatchTrackerStore((state) => state.firstPlayerId === playerId);
  const isSpotlit = useMatchTrackerStore((state) => state.spotlightPlayerId === playerId);
  const isWinner = useMatchTrackerStore((state) => {
    if (state.winnerId === null) {
      return false;
    }
    if (state.winnerId === playerId) {
      return true;
    }
    // In a 2v2 the whole winning team celebrates, not just the player who crossed.
    if (state.mode !== "teams") {
      return false;
    }
    const winner = state.players.find((entry) => entry.id === state.winnerId);
    const self = state.players.find((entry) => entry.id === playerId);
    return winner !== undefined && self !== undefined && winner.team === self.team;
  });
  const adjustPoints = useMatchTrackerStore((state) => state.adjustPoints);
  const adjustXp = useMatchTrackerStore((state) => state.adjustXp);
  const renamePlayer = useMatchTrackerStore((state) => state.renamePlayer);

  if (!player) {
    return null;
  }

  return (
    <section
      aria-label={`${player.name} scorepad`}
      className={cn(
        "bg-card flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border p-4 transition-all duration-150",
        // Team color stays on the border so the ring can layer winner / spotlight on top.
        teamsActive && cn("border-2", TEAM_PANEL_BORDER[player.team]),
        isWinner && "ring-primary/40 ring-2",
        isSpotlit && "ring-primary scale-[1.03] shadow-lg ring-2",
        rotated && "rotate-180",
      )}
    >
      <div className="flex flex-col items-center gap-1.5">
        {teamsActive && (
          <span
            className={cn(
              "text-2xs rounded-full px-2 py-0.5 font-semibold tracking-wide uppercase",
              TEAM_CHIP[player.team],
            )}
          >
            {TEAM_LABELS[player.team]}
          </span>
        )}
        {/* Reserve the badge row on every panel so names stay aligned. */}
        <div className="flex h-5 items-center">
          {isFirst && (
            <span className="bg-primary text-primary-foreground text-2xs inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold tracking-wide uppercase">
              <FlagIcon aria-hidden className="size-3" />
              Goes first
            </span>
          )}
        </div>
        <input
          aria-label={`Name for ${player.name}`}
          value={player.name}
          onChange={(event) => renamePlayer(player.id, event.target.value)}
          className="text-foreground focus-visible:border-ring w-40 rounded-md border border-transparent bg-transparent px-2 py-0.5 text-center font-medium outline-none focus-visible:ring-0"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon-lg"
          className="size-14 rounded-full"
          aria-label={`Subtract a point from ${player.name}`}
          onClick={() => adjustPoints(player.id, -1)}
        >
          <MinusIcon className="size-6" />
        </Button>
        <div className="flex w-24 flex-col items-center">
          {isWinner && <CrownIcon aria-label="Winner" className="text-primary mb-0.5 size-5" />}
          <span className="text-5xl font-bold tabular-nums">{player.points}</span>
          <span className="text-muted-foreground text-xs">of {pointsTarget}</span>
        </div>
        <Button
          variant="outline"
          size="icon-lg"
          className="size-14 rounded-full"
          aria-label={`Add a point to ${player.name}`}
          onClick={() => adjustPoints(player.id, 1)}
        >
          <PlusIcon className="size-6" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Spend XP for ${player.name}`}
          onClick={() => adjustXp(player.id, -1)}
        >
          <MinusIcon className="size-4" />
        </Button>
        <div className="flex w-16 flex-col items-center">
          <span className="text-2xl font-semibold tabular-nums">{player.xp}</span>
          <span className="text-muted-foreground text-2xs uppercase">XP</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Gain XP for ${player.name}`}
          onClick={() => adjustXp(player.id, 1)}
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>
    </section>
  );
}
