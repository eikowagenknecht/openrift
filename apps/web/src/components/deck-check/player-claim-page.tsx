import { useLocation, useNavigate } from "@tanstack/react-router";

import { PAGE_TOP_BAR_STICKY, PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { useClaimLanding, useClaimTournamentDeck } from "@/hooks/use-deck-check-player";
import { useUserId } from "@/lib/auth-session";
import { PAGE_PADDING } from "@/lib/utils";

/**
 * The pre-claim landing for a provider-issued claim link (ADR-026 amendment).
 * Reachable logged-out: it shows only the event and owning group, then either
 * routes through login (when signed out) or claims the entry on confirm. A
 * brand-new account may claim straight away; the token is the capability, so
 * claiming never waits on email verification.
 * @returns The page.
 */
export function PlayerClaimPage({ token }: { token: string }) {
  const { data, isPending, isError } = useClaimLanding(token);
  const claim = useClaimTournamentDeck();
  const userId = useUserId();
  const navigate = useNavigate();
  const location = useLocation();

  if (isPending) {
    return <p className="text-muted-foreground p-6 text-center">Loading...</p>;
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
    if (result.entryId) {
      void navigate({ to: "/tournament-decks/$entryId", params: { entryId: result.entryId } });
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
      <div className={`flex justify-center ${PAGE_PADDING}`}>
        <div className="flex w-full max-w-3xl flex-col gap-4">
          <div className="bg-card flex flex-col gap-1 rounded-md border p-4">
            <h2 className="font-medium">{data.eventName}</h2>
            <p className="text-muted-foreground text-sm">{data.groupName}</p>
          </div>

          {outcome === "conflict" ? (
            <p className="text-muted-foreground">
              This deck is already linked to another account. If that was not you, contact the
              organizer.
            </p>
          ) : outcome === "blocked" ? (
            <p className="text-muted-foreground">
              A judge detached this entry. Contact a judge to get it linked again.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                Link this tournament deck to your OpenRift account to view it any time.
                {userId ? "" : " You will sign in or create an account first."}
              </p>
              <div>
                <Button onClick={() => void onConfirm()} disabled={claim.isPending}>
                  {claim.isPending
                    ? "Claiming..."
                    : userId
                      ? "Claim this deck"
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
