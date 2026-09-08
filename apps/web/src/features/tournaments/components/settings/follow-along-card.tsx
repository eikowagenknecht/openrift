import type { TournamentDetailResponse } from "@openrift/shared/types/api/tournament";
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
import { Label } from "@/components/ui/label";
import { ShareLinkRow } from "@/features/groups/components/share-link-row";
import {
  useSetTournamentFollowToken,
  useSetTournamentReportToken,
} from "@/features/tournaments/hooks/use-tournament-run";
import { runReportedMutation } from "@/lib/run-reported-mutation";
import { getSiteUrl } from "@/lib/site-config";

export function FollowAlongCard({
  detail,
  locked,
}: {
  detail: TournamentDetailResponse;
  locked: boolean;
}) {
  const setReportToken = useSetTournamentReportToken();
  const setFollowToken = useSetTournamentFollowToken();
  const [confirmDisableReport, setConfirmDisableReport] = useState(false);
  const [confirmDisableFollow, setConfirmDisableFollow] = useState(false);

  const reportUrl = detail.reportToken
    ? `${getSiteUrl()}/tournaments/report/${detail.reportToken}`
    : null;
  const followUrl = detail.followToken
    ? `${getSiteUrl()}/tournaments/report/${detail.followToken}`
    : null;

  async function handleDisableReport() {
    await runReportedMutation(() => setReportToken.mutateAsync({ id: detail.id, enabled: false }));
    setConfirmDisableReport(false);
  }

  async function handleDisableFollow() {
    await runReportedMutation(() => setFollowToken.mutateAsync({ id: detail.id, enabled: false }));
    setConfirmDisableFollow(false);
  }

  return (
    <>
      <Card id="follow-along" className="scroll-mt-16">
        <CardHeader>
          <CardTitle>Participant follow-along</CardTitle>
          <CardDescription>
            The reporting link also lets anyone holding it enter their pod result. Nothing counts
            until you finalize the round.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label>Result reporting link</Label>
            <p className="text-muted-foreground text-sm">
              Anyone with this link can follow along and enter pod results.
            </p>
            {reportUrl ? (
              <ShareLinkRow
                url={reportUrl}
                label="Result reporting link"
                defaultQrOpen
                actions={
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={setReportToken.isPending}
                    onClick={() => setConfirmDisableReport(true)}
                  >
                    Disable
                  </Button>
                }
              />
            ) : (
              <Button
                className="w-fit"
                disabled={locked || setReportToken.isPending}
                onClick={() =>
                  void runReportedMutation(() =>
                    setReportToken.mutateAsync({ id: detail.id, enabled: true }),
                  )
                }
              >
                Enable reporting link
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Follow-only link</Label>
            <p className="text-muted-foreground text-sm">
              Anyone with this link can follow along but cannot enter results.
            </p>
            {followUrl ? (
              <ShareLinkRow
                url={followUrl}
                label="Follow-only link"
                defaultQrOpen
                actions={
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={setFollowToken.isPending}
                    onClick={() => setConfirmDisableFollow(true)}
                  >
                    Disable
                  </Button>
                }
              />
            ) : (
              <Button
                className="w-fit"
                disabled={locked || setFollowToken.isPending}
                onClick={() =>
                  void runReportedMutation(() =>
                    setFollowToken.mutateAsync({ id: detail.id, enabled: true }),
                  )
                }
              >
                Enable follow-only link
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmDisableReport} onOpenChange={setConfirmDisableReport}>
        <DialogContent>
          <DialogForm onSubmit={() => void handleDisableReport()}>
            <DialogHeader>
              <DialogTitle>Disable the result reporting link?</DialogTitle>
              <DialogDescription>
                The link stops working for everyone. Re-enabling creates a different link.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmDisableReport(false)}>
                Keep it
              </Button>
              <Button type="submit" variant="destructive" disabled={setReportToken.isPending}>
                Disable link
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDisableFollow} onOpenChange={setConfirmDisableFollow}>
        <DialogContent>
          <DialogForm onSubmit={() => void handleDisableFollow()}>
            <DialogHeader>
              <DialogTitle>Disable the follow-only link?</DialogTitle>
              <DialogDescription>
                The link stops working for everyone. Re-enabling creates a different link.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmDisableFollow(false)}>
                Keep it
              </Button>
              <Button type="submit" variant="destructive" disabled={setFollowToken.isPending}>
                Disable link
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
