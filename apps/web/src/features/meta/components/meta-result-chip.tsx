import type { MetaRoundOutcome } from "@/features/meta/lib/meta-player-run";
import { cn } from "@/lib/utils";

const OUTCOME_CLASS: Record<MetaRoundOutcome, string> = {
  win: "bg-success-soft text-success",
  loss: "bg-destructive-soft text-destructive",
  draw: "bg-muted text-muted-foreground",
  bye: "ring-border text-muted-foreground font-medium ring-1 ring-inset",
  unknown: "bg-muted text-muted-foreground",
};

const OUTCOME_LABEL: Record<MetaRoundOutcome, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  bye: "Bye",
  unknown: "No result",
};

export interface MetaResultChipProps {
  outcome: MetaRoundOutcome;
  gamesWon?: number | null;
  gamesLost?: number | null;
  className?: string;
}

export function MetaResultChip({
  outcome,
  gamesWon = null,
  gamesLost = null,
  className,
}: MetaResultChipProps) {
  const score = gamesWon === null || gamesLost === null ? null : `${gamesWon}-${gamesLost}`;

  return (
    <span
      data-slot="meta-result-chip"
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-4xl px-2 text-xs font-semibold whitespace-nowrap tabular-nums",
        OUTCOME_CLASS[outcome],
        className,
      )}
    >
      {OUTCOME_LABEL[outcome]}
      {score !== null && <span className="font-medium">{score}</span>}
    </span>
  );
}
