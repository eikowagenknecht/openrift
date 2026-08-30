import { Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";

import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { SignedOutAuthButtons } from "@/components/signed-out-cta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClaimStaffInvite, useTournamentStaffInviteLanding } from "@/hooks/use-tournaments";
import { useUserId } from "@/lib/auth-session";
import { STAFF_ROLE_LABEL } from "@/lib/tournament-display";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

/**
 * The one action the landing offers, which differs by who is looking: a
 * stranger signs in first, a host who already holds the role is told so, and
 * everyone else gets the confirm that actually grants it.
 *
 * @returns The action for this viewer.
 */
function StaffInviteAction({
  alreadyStaff,
  roleLabel,
  signedIn,
  pending,
  onConfirm,
}: {
  alreadyStaff: boolean;
  roleLabel: string;
  signedIn: boolean;
  pending: boolean;
  onConfirm: () => void;
}) {
  if (!signedIn) {
    return (
      <>
        <p className="text-muted-foreground text-sm">
          Sign in to accept. Nothing is granted until you confirm.
        </p>
        <SignedOutAuthButtons signInLabel="Sign in to accept" />
      </>
    );
  }
  if (alreadyStaff) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckIcon className="size-4" /> You&apos;re already {roleLabel.toLowerCase()} for this
        event.
      </div>
    );
  }
  return (
    <Button onClick={onConfirm} disabled={pending}>
      Accept and become {roleLabel.toLowerCase()}
    </Button>
  );
}

/**
 * The staff-invite landing: someone opens the host's link, sees the event and
 * the role they'd take, and confirms. The grant happens only on that explicit
 * confirm (a POST that needs a session), never on opening the page, so a link
 * scanner claims nothing and a signed-out invitee still reads what they were
 * invited to before creating an account.
 *
 * @returns The staff-invite confirmation surface.
 */
export function TournamentStaffInvitePage({ token }: { token: string }) {
  const { data } = useTournamentStaffInviteLanding(token);
  const claim = useClaimStaffInvite();
  const navigate = useNavigate();
  const userId = useUserId();
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
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Staff invite</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        <Card>
          <CardHeader>
            <CardTitle>{data.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground">
              Hosted by {data.hostDisplayName}. You&apos;ve been invited to help as{" "}
              <span className="text-foreground font-medium">{roleLabel}</span>.
            </p>
            <StaffInviteAction
              alreadyStaff={data.alreadyStaff}
              roleLabel={roleLabel}
              signedIn={Boolean(userId)}
              pending={claim.isPending}
              onConfirm={handleConfirm}
            />
            {userId ? (
              <Button variant="ghost" render={<Link to="/tournaments" />} className="w-fit">
                Go to my tournaments
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
