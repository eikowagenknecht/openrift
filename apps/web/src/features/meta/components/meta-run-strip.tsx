import { Fragment } from "react";

import type { MetaPlayerRound, MetaRoundOutcome } from "@/features/meta/lib/meta-player-run";
import { cn } from "@/lib/utils";

const OUTCOME_CLASS: Record<MetaRoundOutcome, string> = {
  win: "bg-success",
  loss: "bg-destructive",
  draw: "bg-muted-foreground/45",
  bye: "ring-muted-foreground/45 ring-1 ring-inset",
  unknown: "ring-muted-foreground/45 ring-1 ring-inset",
};

const OUTCOME_WORD: Record<MetaRoundOutcome, string> = {
  win: "win",
  loss: "loss",
  draw: "draw",
  bye: "bye",
  unknown: "no result",
};

function words(rounds: readonly MetaPlayerRound[]): string {
  return rounds.map((round) => OUTCOME_WORD[round.outcome]).join(", ");
}

export function runStripLabel(rounds: readonly MetaPlayerRound[]): string {
  const swiss = words(rounds.filter((round) => !round.isCut));
  const cut = words(rounds.filter((round) => round.isCut));
  if (swiss === "") {
    return cut === "" ? "" : `The cut: ${cut}`;
  }
  if (cut === "") {
    return `Round by round: ${swiss}`;
  }
  return `Round by round: ${swiss}, then the cut: ${cut}`;
}

export function MetaRunStrip({
  rounds,
  className,
}: {
  rounds: readonly MetaPlayerRound[];
  className?: string;
}) {
  if (rounds.length === 0) {
    return null;
  }

  const firstCut = rounds.findIndex((round) => round.isCut);

  return (
    <span
      role="img"
      aria-label={runStripLabel(rounds)}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {rounds.map((round, index) => (
        <Fragment key={`${round.phaseOrder}:${round.roundNumber}`}>
          {index === firstCut && index > 0 && <span className="w-1 shrink-0" />}
          <span
            title={round.isCut ? `Cut round ${round.roundNumber}` : `Round ${round.roundNumber}`}
            className={cn("size-2 shrink-0 rounded-[2px]", OUTCOME_CLASS[round.outcome])}
          />
        </Fragment>
      ))}
    </span>
  );
}
