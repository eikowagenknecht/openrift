import type { TournamentParticipantResponse } from "@openrift/shared/types/api/tournament";
import { Link } from "@tanstack/react-router";
import { LayoutGridIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { ActionBand } from "@/components/ui/action-band";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateTournament } from "@/features/tournaments/hooks/use-tournament-mutations";
import { useGenerateTournamentRound } from "@/features/tournaments/hooks/use-tournament-run";
import { useTournamentParticipants } from "@/features/tournaments/hooks/use-tournaments";
import { checkGroupPlayerCount } from "@/features/tournaments/lib/group-cut-display";
import { runReportedMutation } from "@/lib/run-reported-mutation";

/** Staff-only: the roster endpoint it reads is staff-gated. */
export function GenerateGroupsBand({
  id,
  legendTiebreak,
}: {
  id: string;
  legendTiebreak: boolean;
}) {
  const { data } = useTournamentParticipants(id);
  const generateRound = useGenerateTournamentRound();
  const updateTournament = useUpdateTournament();
  const [checkOpen, setCheckOpen] = useState(false);

  const active = data.items.filter((participant) => participant.status === "active");
  const count = checkGroupPlayerCount(active.length);
  const missingLegend = legendTiebreak
    ? active.filter((participant) => participant.legendCardId === null)
    : [];

  async function generate() {
    await runReportedMutation(() => generateRound.mutateAsync({ id }));
  }

  async function skipLegendTiebreak() {
    await runReportedMutation(() =>
      updateTournament
        .mutateAsync({ id, legendTiebreak: false })
        .then(() => generateRound.mutateAsync({ id })),
    );
    setCheckOpen(false);
  }

  function handleGenerate() {
    if (missingLegend.length > 0) {
      setCheckOpen(true);
      return;
    }
    void generate();
  }

  return (
    <>
      <ActionBand
        icon={LayoutGridIcon}
        accent
        label="Groups"
        value={active.length}
        sub="players to place in groups of four"
        action={
          <Button disabled={!count.valid || generateRound.isPending} onClick={handleGenerate}>
            Generate groups
          </Button>
        }
      >
        {count.message ? (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>{count.message}</AlertTitle>
          </Alert>
        ) : null}
        <p className="text-muted-foreground text-sm">
          Every group plays three rounds. The cut is generated once every group is done.
        </p>
      </ActionBand>
      <MissingLegendDialog
        id={id}
        open={checkOpen}
        players={missingLegend}
        pending={generateRound.isPending || updateTournament.isPending}
        onOpenChange={setCheckOpen}
        onSkip={() => void skipLegendTiebreak()}
      />
    </>
  );
}

function MissingLegendDialog({
  id,
  open,
  players,
  pending,
  onOpenChange,
  onSkip,
}: {
  id: string;
  open: boolean;
  players: TournamentParticipantResponse[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSkip: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {players.length} player{players.length === 1 ? " has" : "s have"} no Legend on file
          </DialogTitle>
          <DialogDescription>
            The Legend tiebreak needs a Legend for every player. Enter the missing ones on the
            participants page, or drop the tiebreak for this tournament.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {players.map((player) => (
            <li key={player.id} className="truncate font-medium">
              {player.displayName}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            render={<Link to="/tournaments/$id/participants" params={{ id }} />}
          >
            Set Legends
          </Button>
          <Button variant="secondary" disabled={pending} onClick={onSkip}>
            Skip Legend tiebreak
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
