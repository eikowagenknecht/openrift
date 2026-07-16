import type { PodRoundResponse } from "@openrift/shared";
import { SwordsIcon, TrophyIcon } from "lucide-react";

import { ActionBand } from "@/components/ui/action-band";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { pairingPluralNoun } from "@/lib/tournament-display";

/**
 * The reported/total split of a round's pods, plus whether the round is all
 * 1v1 matches (Swiss) so the copy can say "matches" instead of "pods".
 * @returns The counts and the noun for a pod on this round.
 */
function roundReportProgress(round: PodRoundResponse) {
  const total = round.pods.length;
  const reported = round.pods.filter((pod) => pod.resultStatus === "reported").length;
  return { total, reported, noun: pairingPluralNoun(round.pods.map((pod) => pod.size)) };
}

/**
 * The open round's state, leading the pairings page: how much of the round has
 * come in, how far through the event it is, and the round's one primary action.
 *
 * @param round The reporting round.
 * @param suggested The Swiss-suggested round count (0 when there is no
 *   suggestion, which drops the "of ~N" tail).
 * @param finalizing Whether the finalize mutation is in flight.
 * @param onFinalize Finalizes the round.
 * @returns The band element.
 */
export function OpenRoundBand({
  round,
  suggested,
  finalizing,
  onFinalize,
}: {
  round: PodRoundResponse;
  suggested: number;
  finalizing: boolean;
  onFinalize: () => void;
}) {
  const { total, reported, noun } = roundReportProgress(round);
  const allReported = total > 0 && reported === total;
  const percent = total === 0 ? 0 : Math.round((reported / total) * 100);
  const progressLabel = `${reported} of ${total} ${noun} reported`;

  return (
    <ActionBand
      icon={SwordsIcon}
      accent={!allReported}
      label={`Round ${round.roundNumber}`}
      value={`${reported}/${total}`}
      sub={
        suggested > 0
          ? `${noun} reported · round ${round.roundNumber} of ~${suggested}`
          : `${noun} reported`
      }
      action={
        <span className="flex items-center gap-2">
          <Badge variant="warning">Reporting</Badge>
          <Button size="sm" disabled={!allReported || finalizing} onClick={onFinalize}>
            Finalize round
          </Button>
        </span>
      }
    >
      <Progress value={percent} aria-label={progressLabel} />
    </ActionBand>
  );
}

/**
 * The read-only band a finished tournament leads with, in place of the open
 * round's state.
 *
 * @param finalizedCount How many rounds were played.
 * @returns The band element.
 */
export function CompletedRoundsBand({ finalizedCount }: { finalizedCount: number }) {
  return (
    <ActionBand
      icon={TrophyIcon}
      label="Tournament over"
      value={finalizedCount}
      sub={`round${finalizedCount === 1 ? "" : "s"} finalized · reopen in Settings to make changes`}
      action={<Badge variant="secondary">Read-only</Badge>}
    />
  );
}
