import type { TournamentDetailResponse } from "@openrift/shared/types/api/tournament";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  useCancelTournament,
  useDeleteTournament,
} from "@/features/tournaments/hooks/use-tournament-mutations";
import { runReportedMutation } from "@/lib/run-reported-mutation";

export function DangerZoneCard({ detail }: { detail: TournamentDetailResponse }) {
  const navigate = useNavigate();
  const cancelTournament = useCancelTournament();
  const deleteTournament = useDeleteTournament();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleCancel() {
    await runReportedMutation(() => cancelTournament.mutateAsync({ id: detail.id }));
    setConfirmCancel(false);
  }

  async function handleDelete() {
    await runReportedMutation(async () => {
      await deleteTournament.mutateAsync(detail.id);
      await navigate({ to: "/tournaments" });
    });
  }

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>
            Cancel makes the tournament read-only but keeps its data. Delete removes it and
            everything in it for good.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {detail.status === "cancelled" ? null : (
              <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
                Cancel tournament
              </Button>
            )}
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete tournament
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogForm onSubmit={() => void handleCancel()}>
            <DialogHeader>
              <DialogTitle>Cancel {detail.name}?</DialogTitle>
              <DialogDescription>
                The tournament becomes read-only for everyone. Its data is kept.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                Keep it
              </Button>
              <Button type="submit" variant="secondary" disabled={cancelTournament.isPending}>
                Cancel tournament
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogForm onSubmit={() => void handleDelete()}>
            <DialogHeader>
              <DialogTitle>Delete {detail.name}?</DialogTitle>
              <DialogDescription>
                This permanently removes the tournament, its participants, rounds, and results. This
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={deleteTournament.isPending}>
                Delete
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
