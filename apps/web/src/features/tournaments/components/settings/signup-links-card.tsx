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
import { Switch } from "@/components/ui/switch";
import { ShareLinkRow } from "@/features/groups/components/share-link-row";
import {
  useSetTournamentSubmissionToken,
  useUpdateTournament,
} from "@/features/tournaments/hooks/use-tournaments";
import { runReportedMutation } from "@/lib/run-reported-mutation";
import { getSiteUrl } from "@/lib/site-config";

/**
 * Self-registration toggle plus the shareable sign-up / deck submission link.
 * Rotating it is confirmed because the old link dies immediately.
 */
export function SignupLinksCard({
  detail,
  locked,
}: {
  detail: TournamentDetailResponse;
  locked: boolean;
}) {
  const updateTournament = useUpdateTournament();
  const setSubmissionToken = useSetTournamentSubmissionToken();
  const [confirmRotate, setConfirmRotate] = useState(false);

  const registrationUrl = detail.submissionToken
    ? `${getSiteUrl()}/tournaments/submit/${detail.submissionToken}`
    : null;
  const deckExpected = detail.deckSubmission !== "none";
  const showLink = detail.selfRegistration || deckExpected;
  const linkLabel = detail.selfRegistration ? "Registration link" : "Deck submission link";

  async function handleRotate() {
    await runReportedMutation(() =>
      setSubmissionToken.mutateAsync({ id: detail.id, enabled: true }),
    );
    setConfirmRotate(false);
  }

  return (
    <>
      <Card id="signup-links" className="scroll-mt-16">
        <CardHeader>
          <CardTitle>Sign-up &amp; deck links</CardTitle>
          <CardDescription>
            Anyone with the link can request a spot. Requests appear on the Overview tab.
            {deckExpected ? " Players also submit their decks through this link." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Switch
              id="t-self-reg"
              checked={detail.selfRegistration}
              disabled={locked || updateTournament.isPending}
              onCheckedChange={(checked) =>
                void runReportedMutation(() =>
                  updateTournament.mutateAsync({ id: detail.id, selfRegistration: checked }),
                )
              }
            />
            <Label htmlFor="t-self-reg">Open self-registration</Label>
          </div>
          {showLink && registrationUrl ? (
            <div className="flex flex-col gap-2">
              <Label>{linkLabel}</Label>
              <ShareLinkRow
                url={registrationUrl}
                label={linkLabel}
                defaultQrOpen
                actions={
                  <Button
                    variant="ghost"
                    disabled={locked || setSubmissionToken.isPending}
                    onClick={() => setConfirmRotate(true)}
                  >
                    Rotate link
                  </Button>
                }
              />
              <p className="text-muted-foreground text-sm">
                Rotating makes a new link and stops the old one working.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <DialogContent>
          <DialogForm onSubmit={() => void handleRotate()}>
            <DialogHeader>
              <DialogTitle>Rotate the link?</DialogTitle>
              <DialogDescription>
                The link stops working for everyone. Re-enabling creates a different link.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmRotate(false)}>
                Keep current link
              </Button>
              <Button type="submit" disabled={locked || setSubmissionToken.isPending}>
                Rotate link
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
