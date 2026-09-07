import type { LucideIcon } from "lucide-react";
import { CrownIcon, FlagIcon, ShieldIcon, SparklesIcon, SwordsIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Pressable } from "@/components/ui/pressable";
import type { TeamId } from "@/features/match-tracker/stores/match-tracker-store";
import {
  SCORE_REASONS,
  SCORE_REASON_LABELS,
  isMatchPoint,
  useMatchTrackerStore,
} from "@/features/match-tracker/stores/match-tracker-store";
import type { MedallionSize, XpSize } from "@/features/tournaments/lib/match-layout";
import { TEAM_CHIP, TEAM_LABELS, TEAM_PANEL_BORDER } from "@/features/tournaments/lib/match-teams";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { deckGlowStyle } from "@/lib/domain";
import { cn } from "@/lib/utils";

const CORRECT_TIMEOUT_MS = 4000;
const MAX_PIP_TARGET = 12;

const VIGNETTE_STYLE = {
  backgroundImage: "radial-gradient(120% 80% at 50% 50%, transparent 34%, var(--color-card) 100%)",
  opacity: 0.7,
};

type ScoringReason = (typeof SCORE_REASONS)[number];

const REASON_ICONS: Record<ScoringReason, LucideIcon> = {
  conquer: SwordsIcon,
  hold: ShieldIcon,
  ability: SparklesIcon,
};

interface MedStyle {
  ring: string;
  icon: string;
  gap: string;
  label: boolean;
}

const MED_STYLES: Record<MedallionSize, MedStyle> = {
  sm: { ring: "size-8", icon: "size-3.5", gap: "gap-2.5", label: false },
  md: { ring: "size-9", icon: "size-4", gap: "gap-4", label: true },
  lg: { ring: "size-11", icon: "size-5", gap: "gap-5", label: true },
};

const XP_STYLES: Record<XpSize, { tab: string; rail: string; step: string; value: string }> = {
  sm: { tab: "h-7 w-5", rail: "w-6", step: "h-4 text-xs", value: "text-xs" },
  md: { tab: "h-8 w-6", rail: "w-7", step: "h-5 text-sm", value: "text-sm" },
  lg: { tab: "h-9 w-7", rail: "w-8", step: "h-6 text-base", value: "text-base" },
  xl: { tab: "h-11 w-8", rail: "w-9", step: "h-7 text-lg", value: "text-lg" },
};

// Subscribes to only its own slice of the store, so a tap on one panel never re-renders the others.
export function PlayerPanel({
  playerId,
  rotated,
  scoreClass,
  medSize,
  xpSize,
}: {
  playerId: string;
  rotated: boolean;
  scoreClass: string;
  medSize: MedallionSize;
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
    if (state.mode !== "teams") {
      return false;
    }
    const winner = state.players.find((entry) => entry.id === state.winnerId);
    const self = state.players.find((entry) => entry.id === playerId);
    return winner !== undefined && self !== undefined && winner.team === self.team;
  });
  const adjustPoints = useMatchTrackerStore((state) => state.adjustPoints);
  const adjustXp = useMatchTrackerStore((state) => state.adjustXp);
  const openXp = useMatchTrackerStore((state) => state.openXp);
  const setScore = useMatchTrackerStore((state) => state.setScore);
  const domainColors = useDomainColors();

  // One counter both opens the correction steppers and dates the current window,
  // so every press lands a new value and restarts the auto-hide clock.
  const [correctionTick, setCorrectionTick] = useState(0);
  const correcting = correctionTick > 0;
  useEffect(() => {
    if (correctionTick === 0) {
      return;
    }
    const timer = setTimeout(() => setCorrectionTick(0), CORRECT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [correctionTick]);

  if (!player) {
    return null;
  }

  const medStyle = MED_STYLES[medSize];
  const xpStyle = XP_STYLES[xpSize];
  const atMatchPoint = isMatchPoint(player, pointsTarget) && !isWinner;
  const glowStyle = deckGlowStyle(player.legend?.domains ?? [], domainColors);

  const correct = (delta: number) => {
    setCorrectionTick((value) => value + 1);
    setScore(player.id, player.points + delta);
  };

  return (
    <section
      aria-label={`${player.name} scorepad`}
      className={cn(
        "bg-card relative flex min-h-0 min-w-0 flex-1 touch-manipulation flex-col items-center justify-between overflow-hidden rounded-lg border p-2 transition-all duration-150 select-none",
        // Team color stays on the border so the ring can layer winner / spotlight on top.
        teamsActive && cn("border-2", TEAM_PANEL_BORDER[player.team]),
        isWinner && "ring-primary/60 ring-2",
        isSpotlit && "ring-primary scale-[1.03] shadow-lg ring-2",
        rotated && "rotate-180",
      )}
    >
      {player.legend?.thumbnail && (
        <img
          src={player.legend.thumbnail}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-md saturate-125 dark:opacity-40"
        />
      )}
      <div aria-hidden="true" className="absolute inset-0" style={glowStyle} />
      <div aria-hidden="true" className="absolute inset-0" style={VIGNETTE_STYLE} />

      {atMatchPoint && <MatchPointFrame />}

      <div className="relative flex w-full flex-col items-center gap-0.5">
        {(teamsActive || isFirst) && (
          <div className="flex items-center gap-1">
            {teamsActive && <TeamChip team={player.team} />}
            {isFirst && <FirstBadge />}
          </div>
        )}
        <span className="text-muted-foreground text-2xs w-full truncate text-center font-semibold tracking-wide uppercase">
          {player.name}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5">
        {isWinner && <CrownIcon aria-label="Winner" className="text-primary size-6" />}
        <div className="flex items-center gap-2">
          {correcting && (
            <Pressable
              aria-label={`Lower ${player.name}'s score`}
              onClick={() => correct(-1)}
              className="bg-background/60 text-foreground hover:border-primary hover:text-primary grid size-8 place-items-center rounded-full border text-lg leading-none"
            >
              −
            </Pressable>
          )}
          <Pressable
            aria-label={`Correct ${player.name}'s score, currently ${player.points}`}
            onClick={() => setCorrectionTick((value) => value + 1)}
            className={cn("font-heading leading-none font-bold tabular-nums", scoreClass)}
          >
            {player.points}
          </Pressable>
          {correcting && (
            <Pressable
              aria-label={`Raise ${player.name}'s score`}
              onClick={() => correct(1)}
              className="bg-background/60 text-foreground hover:border-primary hover:text-primary grid size-8 place-items-center rounded-full border text-lg leading-none"
            >
              +
            </Pressable>
          )}
        </div>
        <TargetProgress points={player.points} target={pointsTarget} />
      </div>

      <div className={cn("relative flex items-start justify-center", medStyle.gap)}>
        {SCORE_REASONS.map((reason) => (
          <ScoreMedallion
            key={reason}
            reason={reason}
            playerName={player.name}
            style={medStyle}
            onScore={() => adjustPoints(player.id, 1, reason)}
          />
        ))}
      </div>

      {/* Stays a tab until someone opens it, and never closes mid-game once opened. */}
      {player.xpOpen ? (
        <div
          className={cn(
            "bg-background/60 absolute top-1/2 left-1 flex -translate-y-1/2 flex-col items-center overflow-hidden rounded-full border",
            xpStyle.rail,
          )}
        >
          <Pressable
            aria-label={`Gain XP for ${player.name}`}
            onClick={() => adjustXp(player.id, 1)}
            className={cn(
              "text-muted-foreground hover:text-primary hover:bg-foreground/10 grid w-full place-items-center leading-none",
              xpStyle.step,
            )}
          >
            +
          </Pressable>
          <span className="border-border flex w-full flex-col items-center border-y py-0.5">
            <span className={cn("font-semibold tabular-nums", xpStyle.value)}>{player.xp}</span>
            <span className="text-muted-foreground text-2xs font-bold tracking-wide">XP</span>
          </span>
          <Pressable
            aria-label={`Spend XP for ${player.name}`}
            onClick={() => adjustXp(player.id, -1)}
            className={cn(
              "text-muted-foreground hover:text-primary hover:bg-foreground/10 grid w-full place-items-center leading-none",
              xpStyle.step,
            )}
          >
            −
          </Pressable>
        </div>
      ) : (
        <Pressable
          aria-label={`Track XP for ${player.name}`}
          onClick={() => openXp(player.id)}
          className={cn(
            "border-border/60 text-muted-foreground/60 hover:border-primary hover:text-primary text-2xs absolute top-1/2 left-1 grid -translate-y-1/2 place-items-center rounded-full border bg-black/20 font-bold tracking-wide",
            xpStyle.tab,
          )}
        >
          XP
        </Pressable>
      )}
    </section>
  );
}

function ScoreMedallion({
  reason,
  playerName,
  style,
  onScore,
}: {
  reason: ScoringReason;
  playerName: string;
  style: MedStyle;
  onScore: () => void;
}) {
  const Icon = REASON_ICONS[reason];
  const label = SCORE_REASON_LABELS[reason];
  return (
    <Pressable
      aria-label={`${label} point for ${playerName}`}
      onClick={onScore}
      className="flex flex-col items-center gap-1"
    >
      <span
        className={cn(
          "border-border-accent hover:border-primary grid place-items-center rounded-full border bg-black/35 transition-colors",
          style.ring,
        )}
      >
        <Icon className={cn("text-primary", style.icon)} />
      </span>
      {style.label && (
        <span className="text-muted-foreground text-2xs font-bold tracking-wide uppercase">
          {label}
        </span>
      )}
    </Pressable>
  );
}

function TargetProgress({ points, target }: { points: number; target: number }) {
  if (target > MAX_PIP_TARGET) {
    return <span className="text-muted-foreground text-2xs">of {target}</span>;
  }
  return (
    <span className="flex gap-0.5" aria-label={`${points} of ${target} points`}>
      {Array.from({ length: target }, (_, index) => (
        <i
          key={index}
          className={cn(
            "h-0.5 w-2 rounded-full",
            index < points ? "bg-primary" : "bg-foreground/15",
          )}
        />
      ))}
    </span>
  );
}

function MatchPointFrame() {
  return (
    <span aria-hidden="true">
      <i className="border-primary absolute top-1 left-1 size-4 rounded-tl-sm border-t-2 border-l-2" />
      <i className="border-primary absolute top-1 right-1 size-4 rounded-tr-sm border-t-2 border-r-2" />
      <i className="border-primary absolute bottom-1 left-1 size-4 rounded-bl-sm border-b-2 border-l-2" />
      <i className="border-primary absolute right-1 bottom-1 size-4 rounded-br-sm border-r-2 border-b-2" />
    </span>
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
