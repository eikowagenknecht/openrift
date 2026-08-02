import type { TournamentDetailResponse } from "@openrift/shared";
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
import { useCancelTournament, useDeleteTournament } from "@/hooks/use-tournaments";

/**
 * Cancel (read-only, data kept) and delete (gone for good). Both are confirmed;
 * a successful delete navigates away because the page it lives on no longer
 * exists.
 * @returns The danger-zone card.
 */
export function DangerZoneCard({ detail }: { detail: TournamentDetailResponse }) {
  const navigate = useNavigate();
  const cancelTournament = useCancelTournament();
  const deleteTournament = useDeleteTournament();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
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
          <DialogForm
            onSubmit={async () => {
              await run(() => cancelTournament.mutateAsync({ id: detail.id }));
              setConfirmCancel(false);
            }}
          >
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
          <DialogForm
            onSubmit={async () => {
              await run(async () => {
                await deleteTournament.mutateAsync(detail.id);
                await navigate({ to: "/tournaments" });
              });
            }}
          >
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
