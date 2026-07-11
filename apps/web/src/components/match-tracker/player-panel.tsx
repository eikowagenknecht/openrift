import { CrownIcon, FlagIcon, MinusIcon, PlusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { XpSize } from "@/lib/match-layout";
import { TEAM_CHIP, TEAM_LABELS, TEAM_PANEL_BORDER } from "@/lib/match-teams";
import { cn } from "@/lib/utils";
import { useMatchTrackerStore } from "@/stores/match-tracker-store";
import type { TeamId } from "@/stores/match-tracker-store";

/** How the bottom-corner XP pill scales with the card (see xpSizeTier). */
const XP_STYLES: Record<
  XpSize,
  {
    pos: string;
    height: string;
    px: string;
    gap: string;
    hint: string;
    value: string;
    label: string;
  }
> = {
  sm: {
    pos: "bottom-1 left-1",
    height: "h-9",
    px: "px-2.5",
    gap: "gap-1",
    hint: "size-4",
    value: "text-lg",
    label: "text-2xs",
  },
  md: {
    pos: "bottom-1 left-1",
    height: "h-10",
    px: "px-2.5",
    gap: "gap-1.5",
    hint: "size-4",
    value: "text-lg",
    label: "text-2xs",
  },
  lg: {
    pos: "bottom-2 left-2",
    height: "h-14",
    px: "px-3.5",
    gap: "gap-2",
    hint: "size-5",
    value: "text-2xl",
    label: "text-sm",
  },
  xl: {
    pos: "bottom-2 left-2",
    height: "h-16",
    px: "px-4",
    gap: "gap-2.5",
    hint: "size-6",
    value: "text-4xl",
    label: "text-sm",
  },
};

/**
 * One player's scorepad. Tapping the left half of the card subtracts a point and
 * the right half adds one; the score scales to the card via `scoreClass`. XP
 * lives in a small corner cluster. The name is read-only here — it's edited from
 * the setup screen. Subscribes to only its own slice of the store so a tap on one
 * panel never re-renders the others (per the per-row selector convention).
 * @returns The player panel, or null if the id is no longer in the roster.
 */
export function PlayerPanel({
  playerId,
  rotated,
  scoreClass,
  xpSize,
}: {
  playerId: string;
  rotated: boolean;
  scoreClass: string;
  xpSize: XpSize;
}) {
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

  if (!player) {
    return null;
  }

  const xpStyle = XP_STYLES[xpSize];

  return (
    <section
      aria-label={`${player.name} scorepad`}
      className={cn(
        // min-w-0 lets two panels share a narrow row without forcing overflow;
        // overflow-hidden keeps the tap-zone highlight inside the rounded corners.
        "bg-card relative min-h-0 min-w-0 flex-1 touch-manipulation overflow-hidden rounded-lg border transition-all duration-150 select-none",
        // Team color stays on the border so the ring can layer winner / spotlight on top.
        teamsActive && cn("border-2", TEAM_PANEL_BORDER[player.team]),
        isWinner && "ring-primary/40 ring-2",
        isSpotlit && "ring-primary scale-[1.03] shadow-lg ring-2",
        rotated && "rotate-180",
      )}
    >
      {/* Tap zones: left half subtracts a point, right half adds one. They rotate
          with the card, so a far-side player's own left is still minus. */}
      {/* oxlint-disable-next-line react/forbid-elements -- invisible full-bleed tap zone; deliberately unstyled gesture surface */}
      <button
        type="button"
        aria-label={`Subtract a point from ${player.name}`}
        onClick={() => adjustPoints(player.id, -1)}
        className="text-muted-foreground/25 hover:text-muted-foreground/50 active:bg-foreground/5 absolute inset-y-0 left-0 flex w-1/2 items-center justify-start pl-3 transition-colors"
      >
        <MinusIcon className="size-7" />
      </button>
      {/* oxlint-disable-next-line react/forbid-elements -- invisible full-bleed tap zone; deliberately unstyled gesture surface */}
      <button
        type="button"
        aria-label={`Add a point to ${player.name}`}
        onClick={() => adjustPoints(player.id, 1)}
        className="text-muted-foreground/25 hover:text-muted-foreground/50 active:bg-foreground/5 absolute inset-y-0 right-0 flex w-1/2 items-center justify-end pr-3 transition-colors"
      >
        <PlusIcon className="size-7" />
      </button>

      {/* Read-only display; taps pass straight through to the zones beneath. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center px-2 py-1.5">
        <div className="flex w-full flex-col items-center gap-0.5">
          {(teamsActive || isFirst) && (
            <div className="flex items-center gap-1">
              {teamsActive && <TeamChip team={player.team} />}
              {isFirst && <FirstBadge />}
            </div>
          )}
          <span className="text-foreground w-full truncate text-center font-medium">
            {player.name}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          {isWinner && <CrownIcon aria-label="Winner" className="text-primary mb-1 size-6" />}
          <span className={cn("font-heading leading-none font-bold tabular-nums", scoreClass)}>
            {player.points}
          </span>
          <span className="text-muted-foreground mt-1 text-xs">of {pointsTarget}</span>
        </div>
      </div>

      {/* XP: same gesture as the card — tap the left half to spend, the right
          half to gain — inside a bordered pill so it reads as its own control,
          separate from the point tap zones. The press highlight is clipped to
          the pill's rounded shape. Scales with the card. */}
      <div
        className={cn(
          "bg-card absolute flex items-center overflow-hidden rounded-full border shadow-sm",
          xpStyle.pos,
          xpStyle.height,
        )}
      >
        {/* oxlint-disable-next-line react/forbid-elements -- invisible half-pill tap zone; deliberately unstyled gesture surface */}
        <button
          type="button"
          aria-label={`Spend XP for ${player.name}`}
          onClick={() => adjustXp(player.id, -1)}
          className="active:bg-foreground/10 absolute inset-y-0 left-0 w-1/2 transition-colors"
        />
        {/* oxlint-disable-next-line react/forbid-elements -- invisible half-pill tap zone; deliberately unstyled gesture surface */}
        <button
          type="button"
          aria-label={`Gain XP for ${player.name}`}
          onClick={() => adjustXp(player.id, 1)}
          className="active:bg-foreground/10 absolute inset-y-0 right-0 w-1/2 transition-colors"
        />
        <span className={cn("pointer-events-none flex items-center", xpStyle.px, xpStyle.gap)}>
          <MinusIcon className={cn("text-muted-foreground/50 shrink-0", xpStyle.hint)} />
          <span className={cn("text-muted-foreground flex items-baseline gap-0.5", xpStyle.label)}>
            <span className={cn("text-foreground font-semibold tabular-nums", xpStyle.value)}>
              {player.xp}
            </span>
            XP
          </span>
          <PlusIcon className={cn("text-muted-foreground/50 shrink-0", xpStyle.hint)} />
        </span>
      </div>
    </section>
  );
}

function TeamChip({ team }: { team: TeamId }) {
  return (
    <span
      className={cn(
        "text-2xs rounded-full px-2 py-0.5 font-semibold tracking-wide uppercase",
        TEAM_CHIP[team],
      )}
    >
      {TEAM_LABELS[team]}
    </span>
  );
}

function FirstBadge() {
  return (
    <Badge className="text-2xs font-semibold tracking-wide uppercase">
      <FlagIcon aria-hidden className="size-3" />
      Goes first
    </Badge>
  );
}
