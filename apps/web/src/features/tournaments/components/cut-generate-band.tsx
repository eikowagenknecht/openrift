import type { CutSize } from "@openrift/shared/pairing/group-cut-types";
import type {
  GroupStageView,
  LegendMetaShareView,
} from "@openrift/shared/types/api/pod-tournament";
import { TrophyIcon } from "lucide-react";
import { useState } from "react";

import { ActionBand } from "@/components/ui/action-band";
import { Button } from "@/components/ui/button";
import { useGenerateTournamentRound } from "@/features/tournaments/hooks/use-tournament-run";
import { cutRoundLabel } from "@/features/tournaments/lib/group-cut-display";
import { groupUnits, waitingUnitsLabel } from "@/features/tournaments/lib/group-cut-units";
import { runReportedMutation } from "@/lib/run-reported-mutation";

import { LegendMetaSharesDialog } from "./legend-meta-shares-dialog";

export function NextCutRoundBand({
  id,
  cutSize,
  nextRoundNumber,
}: {
  id: string;
  cutSize: CutSize;
  nextRoundNumber: number;
}) {
  const generateRound = useGenerateTournamentRound();
  const label = cutRoundLabel(cutSize, nextRoundNumber);
  return (
    <ActionBand
      icon={TrophyIcon}
      accent
      label="Bracket"
      value={label}
      valueClassName="font-sans text-base font-medium"
      sub="winners of the last round"
      action={
        <Button
          disabled={generateRound.isPending}
          onClick={() => void runReportedMutation(() => generateRound.mutateAsync({ id }))}
        >
          Generate {label.toLowerCase()}
        </Button>
      }
    />
  );
}

export function CutGenerateBand({
  id,
  cutSize,
  groupStage,
  shares,
  staff,
}: {
  id: string;
  cutSize: CutSize;
  groupStage: GroupStageView;
  shares: LegendMetaShareView[];
  staff: boolean;
}) {
  const generateRound = useGenerateTournamentRound();
  const [sharesOpen, setSharesOpen] = useState(false);

  const waiting = waitingUnitsLabel(groupUnits(groupStage.groups));
  const needsShares = groupStage.pendingMetaShares.length > 0;
  const blocked = waiting !== null || needsShares;

  return (
    <>
      <ActionBand
        icon={TrophyIcon}
        accent={!blocked}
        label="Top cut"
        value={cutSize}
        sub={waiting ? `waiting for ${waiting}` : "qualifiers seeded from the group standings"}
        action={
          <span className="flex items-center gap-2">
            {needsShares && staff ? (
              <Button variant="outline" onClick={() => setSharesOpen(true)}>
                Enter meta shares
              </Button>
            ) : null}
            <Button
              disabled={blocked || generateRound.isPending}
              onClick={() => void runReportedMutation(() => generateRound.mutateAsync({ id }))}
            >
              Generate top {cutSize}
            </Button>
          </span>
        }
      >
        {needsShares ? (
          <p className="text-muted-foreground text-sm">
            Enter meta shares first. A tie in the group standings needs the meta share of{" "}
            {groupStage.pendingMetaShares.length} Legend
            {groupStage.pendingMetaShares.length === 1 ? "" : "s"} before the seeds can be locked.
          </p>
        ) : null}
      </ActionBand>
      {staff ? (
        <LegendMetaSharesDialog
          id={id}
          pending={groupStage.pendingMetaShares}
          shares={shares}
          open={sharesOpen}
          onOpenChange={setSharesOpen}
        />
      ) : null}
    </>
  );
}
