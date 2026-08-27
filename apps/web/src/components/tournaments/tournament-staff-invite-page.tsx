import { Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { SignedOutAuthButtons } from "@/components/signed-out-cta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClaimStaffInvite, useTournamentStaffInviteLanding } from "@/hooks/use-tournaments";
import { useUserId } from "@/lib/auth-session";
import { STAFF_ROLE_LABEL } from "@/lib/tournament-display";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

function StaffInviteFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <PageTopBarSticky maxWidth="md">
        <PageTopBar>
          <PageTopBarTitle>Staff invite</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("mx-auto flex w-full max-w-md flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        </Card>
      </div>
    </>
  );
}

/**
 * The staff-invite landing: someone opens the host's link, sees the role they'd
 * take, and confirms. The grant happens only on this explicit confirm (a POST),
 * never on opening the page, so link scanners can't claim it.
 *
 * The page itself is reachable signed out, but the landing API is not, so an
 * anonymous visitor gets the sign-in step rather than a bare login wall. The
 * event's details appear once they have a session.
 *
 * @returns The staff-invite confirmation surface.
 */
export function TournamentStaffInvitePage({ token }: { token: string }) {
  const userId = useUserId();
  if (!userId) {
    return (
      <StaffInviteFrame title="You've been invited to help run an event">
        <p className="text-muted-foreground">
          Sign in to see which tournament this invite is for and the role it gives you. Nothing is
          accepted until you confirm.
        </p>
        <SignedOutAuthButtons signInLabel="Sign in to see the invite" />
      </StaffInviteFrame>
    );
  }
  return <StaffInviteDetail token={token} />;
}

function StaffInviteDetail({ token }: { token: string }) {
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
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <StaffInviteFrame title={data.name}>
      <p className="text-muted-foreground">
        Hosted by {data.hostDisplayName}. You&apos;ve been invited to help as{" "}
        <span className="text-foreground font-medium">{roleLabel}</span>.
      </p>
      {data.alreadyStaff ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckIcon className="size-4" /> You&apos;re already {roleLabel.toLowerCase()} for this
          event.
        </div>
      ) : (
        <Button onClick={handleConfirm} disabled={claim.isPending}>
          Accept and become {roleLabel.toLowerCase()}
        </Button>
      )}
      <Button variant="ghost" render={<Link to="/tournaments" />} className="w-fit">
        Go to my tournaments
      </Button>
    </StaffInviteFrame>
  );
}
