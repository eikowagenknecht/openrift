import { Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";

import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClaimStaffInvite, useTournamentStaffInviteLanding } from "@/hooks/use-tournaments";
import { STAFF_ROLE_LABEL } from "@/lib/tournament-display";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

/**
 * The staff-invite landing: a logged-in person opens the host's link, sees the
 * role they'd take, and confirms. The grant happens only on this explicit
 * confirm (a POST), never on opening the page, so link scanners can't claim it.
 * @returns The staff-invite confirmation surface.
 */
export function TournamentStaffInvitePage({ token }: { token: string }) {
  const { data } = useTournamentStaffInviteLanding(token);
  const claim = useClaimStaffInvite();
  const navigate = useNavigate();
  const roleLabel = STAFF_ROLE_LABEL[data.role];

  async function handleConfirm() {
    const successMessage = `You're now ${roleLabel === "Judge" ? "a judge" : "an organizer"}`;
    try {
      const result = await claim.mutateAsync(token);
      toast.success(successMessage);
      void navigate({ to: "/tournaments/$id", params: { id: result.tournamentId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't accept the invite");
    }
  }

  return (
    <>
      <PageTopBarSticky maxWidth="md">
        <PageTopBar>
          <PageTopBarTitle>Staff invite</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("mx-auto flex w-full max-w-md flex-col gap-6", PAGE_PADDING_NO_TOP)}>
        <Card>
          <CardHeader>
            <CardTitle>{data.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground">
              Hosted by {data.hostDisplayName}. You&apos;ve been invited to help as{" "}
              <span className="text-foreground font-medium">{roleLabel}</span>.
            </p>
            {data.alreadyStaff ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckIcon className="size-4" /> You&apos;re already {roleLabel.toLowerCase()} for
                this event.
              </div>
            ) : (
              <Button onClick={handleConfirm} disabled={claim.isPending}>
                Accept and become {roleLabel.toLowerCase()}
              </Button>
            )}
            <Button variant="ghost" render={<Link to="/tournaments" />} className="w-fit">
              Go to my tournaments
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
