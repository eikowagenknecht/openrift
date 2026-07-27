import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Building2Icon, CalendarIcon, UsersIcon } from "lucide-react";

import { DeckCheckInfoCardSkeleton } from "@/components/deck-check/deck-check-skeletons";
import { PAGE_TOP_BAR_STICKY, PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClaimLanding, useClaimTournamentDeck } from "@/hooks/use-deck-check-player";
import { useUserId } from "@/lib/auth-session";
import { formatTournamentDate } from "@/lib/tournament-display";
import { cn, PAGE_PADDING } from "@/lib/utils";

/**
 * The pre-claim landing for a participant claim link (ADR-026 amendment,
 * ADR-033). Reachable logged-out: it shows only the tournament, its linked group
 * (if any), and the spot's name, then either routes through login (when signed
 * out) or claims the spot on confirm. A brand-new account may claim straight
 * away; the token is the capability, so claiming never waits on email
 * verification. After claiming it lands on the deck (when the tournament runs
 * deck check) or the tournament page.
 * @returns The page.
 */
export function PlayerClaimPage({ token }: { token: string }) {
  const { data, isPending, isError } = useClaimLanding(token);
  const claim = useClaimTournamentDeck();
  const userId = useUserId();
  const navigate = useNavigate();
  const location = useLocation();

  if (isPending) {
    return (
      <div>
        <div className={PAGE_TOP_BAR_STICKY}>
          <div className="mx-auto w-full max-w-3xl">
            <PageTopBar>
              <PageTopBarTitle>Claim your spot</PageTopBarTitle>
            </PageTopBar>
          </div>
        </div>
        <div className={cn("flex justify-center", PAGE_PADDING)}>
          <div className="flex w-full max-w-3xl flex-col gap-4">
            <DeckCheckInfoCardSkeleton />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="text-muted-foreground p-6 text-center">
        This claim link is not valid. Ask the organizer for a current one.
      </p>
    );
  }

  const onConfirm = async () => {
    if (!userId) {
      void navigate({ to: "/login", search: { redirect: location.href, email: undefined } });
      return;
    }
    const result = await claim.mutateAsync(token);
    // Only route on a successful (or idempotent) claim; refusals — conflict,
    // blocked, duplicate — stay on the page and render their explanation.
    if (
      (result.status === "claimed" || result.status === "already") &&
      result.tournamentId !== null
    ) {
      void navigate({
        // The deck page when the claim carried one, the tournament otherwise.
        to: result.entryId ? "/tournaments/$id/my-deck" : "/tournaments/$id",
        params: { id: result.tournamentId },
      });
    }
  };

  const outcome = claim.data?.status;

  return (
    <div>
      <div className={PAGE_TOP_BAR_STICKY}>
        <div className="mx-auto w-full max-w-3xl">
          <PageTopBar>
            <PageTopBarTitle>Claim your deck</PageTopBarTitle>
          </PageTopBar>
        </div>
      </div>
      <div className={cn("flex justify-center", PAGE_PADDING)}>
        <div className="flex w-full max-w-3xl flex-col gap-4">
          <Card className="gap-2 p-4">
            <h2 className="font-medium">{data.tournamentName}</h2>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5">
                <CalendarIcon className="size-4 shrink-0" />
                {formatTournamentDate(data.startsAt)}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <Building2Icon className="size-4 shrink-0" />
                <span className="truncate">{data.hostName}</span>
              </span>
              {data.groupName ? (
                <span className="flex min-w-0 items-center gap-1.5">
                  <UsersIcon className="size-4 shrink-0" />
                  <span className="truncate">{data.groupName}</span>
                </span>
              ) : null}
            </div>
            <p className="text-sm">
              Your spot: <span className="font-medium">{data.participantName}</span>
            </p>
          </Card>

          {outcome === "conflict" ? (
            <p className="text-muted-foreground">
              This spot is already linked to another account. If that was not you, contact the
              organizer.
            </p>
          ) : outcome === "blocked" ? (
            <p className="text-muted-foreground">
              A judge detached this spot. Contact a judge to get it linked again.
            </p>
          ) : outcome === "duplicate" ? (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground">
                Your account is already entered in this tournament under a different spot, so this
                one can&apos;t also be linked to it. If that&apos;s a mistake, contact the
                organizer.
              </p>
              {claim.data?.tournamentId ? (
                <div>
                  <Button
                    render={
                      <Link
                        to={claim.data.entryId ? "/tournaments/$id/my-deck" : "/tournaments/$id"}
                        params={{ id: claim.data.tournamentId }}
                      />
                    }
                  >
                    {claim.data.entryId ? "Go to your deck" : "Go to the tournament"}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <p className="text-muted-foreground">
                {data.deckSubmission === "none"
                  ? "Link this spot to your OpenRift account to follow this tournament and its standings any time."
                  : "Link this spot to your OpenRift account to hand in your decklist and follow this tournament any time."}
                {userId ? "" : " You will sign in or create an account first."}
              </p>
              <div>
                <Button onClick={() => void onConfirm()} disabled={claim.isPending}>
                  {claim.isPending
                    ? "Claiming..."
                    : userId
                      ? "Claim this spot"
                      : "Sign in to claim"}
                </Button>
              </div>
              {claim.isError ? (
                <p className="text-destructive text-sm">Something went wrong. Please try again.</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
