import type { TournamentDetailResponse } from "@openrift/shared";
import { useState } from "react";

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
import { Switch } from "@/components/ui/switch";
import { useSetTournamentSubmissionToken, useUpdateTournament } from "@/hooks/use-tournaments";
import { getSiteUrl } from "@/lib/site-config";

/**
 * Self-registration toggle plus the shareable sign-up / deck submission link.
 * The link is only shown when it does something, and rotating it is confirmed
 * because the old link dies immediately.
 * @returns The sign-up links card.
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
  // The link is shown when it does something: open registration or deck submission.
  const showLink = detail.selfRegistration || deckExpected;
  const linkLabel = detail.selfRegistration ? "Registration link" : "Deck submission link";

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <>
      <Card id="signup-links" className="scroll-mt-16">
        <CardHeader>
          <CardTitle>Sign-up &amp; deck links</CardTitle>
          <CardDescription>
            When on, anyone with the link below can request a spot; requests appear on the Overview
            tab for approval.
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
                void run(() =>
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
          <DialogForm
            onSubmit={async () => {
              await run(() => setSubmissionToken.mutateAsync({ id: detail.id, enabled: true }));
              setConfirmRotate(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>Rotate the link?</DialogTitle>
              <DialogDescription>
                This makes a new link and immediately stops the old one working. Anyone you already
                shared it with will need the new link.
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
