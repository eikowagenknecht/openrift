import type { CutSize } from "@openrift/shared/pairing/group-cut-types";
import type {
  GroupStageView,
  LegendMetaShareView,
} from "@openrift/shared/types/api/pod-tournament";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

import { CutSeedsCard, GroupStandingsCard, GroupTiebreakNote } from "./group-standings-cards";
import { LegendMetaSharesDialog } from "./legend-meta-shares-dialog";

export function GroupCutStandings({
  groupStage,
  cutSize,
  legendTiebreak,
  metaShares,
}: {
  groupStage: GroupStageView;
  cutSize: CutSize;
  legendTiebreak: boolean;
  /** Staff only: enables the meta-share dialog for the pending Legends. */
  metaShares?: { id: string; shares: LegendMetaShareView[] };
}) {
  const [sharesOpen, setSharesOpen] = useState(false);
  const needsShares = groupStage.pendingMetaShares.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {needsShares && metaShares ? (
        <Callout className="flex flex-wrap items-center justify-between gap-3">
          <span>
            A tie waits on the meta share of {groupStage.pendingMetaShares.length} Legend
            {groupStage.pendingMetaShares.length === 1 ? "" : "s"}. The cut cannot be generated
            until the numbers are in.
          </span>
          <Button variant="outline" onClick={() => setSharesOpen(true)}>
            Enter meta shares
          </Button>
        </Callout>
      ) : null}
      {groupStage.groups.map((group) => (
        <GroupStandingsCard key={group.id} group={group} />
      ))}
      <CutSeedsCard groupStage={groupStage} cutSize={cutSize} />
      <Callout>
        <GroupTiebreakNote legendTiebreak={legendTiebreak} />
      </Callout>
      {metaShares ? (
        <LegendMetaSharesDialog
          id={metaShares.id}
          pending={groupStage.pendingMetaShares}
          shares={metaShares.shares}
          open={sharesOpen}
          onOpenChange={setSharesOpen}
        />
      ) : null}
    </div>
  );
}
