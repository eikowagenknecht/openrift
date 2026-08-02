import type { TournamentDetailResponse } from "@openrift/shared";
import { useState } from "react";
import { toast } from "sonner";

import { ShareLinkRow } from "@/components/share/share-link-row";
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
import { useSetTournamentFollowToken, useSetTournamentReportToken } from "@/hooks/use-tournaments";
import { getSiteUrl } from "@/lib/site-config";

/**
 * The two participant-facing links: one that also accepts pod results, one that
 * is read-only. Disabling either kills the link for everyone holding it, so
 * both are confirmed.
 * @returns The follow-along card.
 */
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

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <>
      <Card id="follow-along" className="scroll-mt-16">
        <CardHeader>
          <CardTitle>Participant follow-along</CardTitle>
          <CardDescription>
            Share a link so players can follow rounds and standings on their own device. The
            reporting link also lets anyone holding it enter their pod result; nothing counts until
            you finalize the round.
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
                  void run(() => setReportToken.mutateAsync({ id: detail.id, enabled: true }))
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
                  void run(() => setFollowToken.mutateAsync({ id: detail.id, enabled: true }))
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
          <DialogForm
            onSubmit={async () => {
              await run(() => setReportToken.mutateAsync({ id: detail.id, enabled: false }));
              setConfirmDisableReport(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>Disable the result reporting link?</DialogTitle>
              <DialogDescription>
                The link stops working for everyone. You can enable a new one later, but it will be
                a different link.
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
          <DialogForm
            onSubmit={async () => {
              await run(() => setFollowToken.mutateAsync({ id: detail.id, enabled: false }));
              setConfirmDisableFollow(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>Disable the follow-only link?</DialogTitle>
              <DialogDescription>
                The link stops working for everyone. You can enable a new one later, but it will be
                a different link.
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
