import type { PublicTournamentLandingResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PlayerSubmitDeckSection } from "@/components/deck-check/player-submit-page";
import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { SignedOutAuthButtons } from "@/components/signed-out-cta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRequestJoinTournament, useTournamentSubmitLanding } from "@/hooks/use-tournaments";
import { useUserId } from "@/lib/auth-session";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

const CLAIM_LINK_HINT =
  "The organizer adds players directly. Open the personal claim link they sent you to take your spot.";

function SignedOutJoinState({ data }: { data: PublicTournamentLandingResponse }) {
  if (!data.selfRegistrationOpen) {
    return <p className="text-muted-foreground text-sm">{CLAIM_LINK_HINT}</p>;
  }
  return (
    <>
      <p className="text-muted-foreground text-sm">
        {data.deckExpected
          ? "Sign in to request a spot and hand in your decklist."
          : "Sign in to request a spot."}
      </p>
      <SignedOutAuthButtons signInLabel="Sign in to request a spot" />
    </>
  );
}

function SignedInJoinState({
  data,
  joined,
  pending,
  onJoin,
}: {
  data: PublicTournamentLandingResponse;
  joined: boolean;
  pending: boolean;
  onJoin: () => void;
}) {
  if (joined) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckIcon className="size-4" /> Your request was sent. The host will review it.
      </div>
    );
  }
  if (data.selfRegistrationOpen) {
    return (
      <Button onClick={onJoin} disabled={pending}>
        Request to join
      </Button>
    );
  }
  if (data.viewerIsParticipant) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckIcon className="size-4" /> You have a spot in this event.
      </div>
    );
  }
  return <p className="text-muted-foreground text-sm">{CLAIM_LINK_HINT}</p>;
}

export function TournamentSubmitPage({ token }: { token: string }) {
  const { data } = useTournamentSubmitLanding(token);
  const requestJoin = useRequestJoinTournament();
  const userId = useUserId();
  const [joined, setJoined] = useState(false);

  async function handleJoin() {
    let result;
    try {
      result = await requestJoin.mutateAsync({ token });
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
      return;
    }
    setJoined(true);
    toast.success(result.alreadyJoined ? "You are already registered" : "Request sent");
  }

  // When self-registration is closed, the link only takes a deck from someone
  // who already holds a spot (claimed via the personal link). A stranger is
  // pointed at their claim link instead of a dead "not open" message. Handing
  // in a deck is account-scoped, so it never shows to a signed-out visitor.
  const canSubmitDeck =
    Boolean(userId) && data.deckExpected && (data.selfRegistrationOpen || data.viewerIsParticipant);

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Join tournament</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("flex flex-col gap-6 pt-3", PAGE_WIDTH.capped, PAGE_PADDING_NO_TOP)}>
        <Card>
          <CardHeader>
            <CardTitle>{data.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground">Hosted by {data.hostDisplayName}.</p>
            {data.deckExpected && canSubmitDeck ? (
              <p className="text-muted-foreground text-sm">
                {data.selfRegistrationOpen
                  ? "This event expects a decklist. Request a spot, then submit your deck below."
                  : "Submit your deck for this event below."}
              </p>
            ) : null}
            {userId ? (
              <>
                <SignedInJoinState
                  data={data}
                  joined={joined}
                  pending={requestJoin.isPending}
                  onJoin={() => void handleJoin()}
                />
                <Button variant="ghost" render={<Link to="/tournaments" />} className="w-fit">
                  Go to my tournaments
                </Button>
              </>
            ) : (
              <SignedOutJoinState data={data} />
            )}
          </CardContent>
        </Card>

        {canSubmitDeck ? <PlayerSubmitDeckSection token={token} /> : null}
      </div>
    </>
  );
}
