import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PlayerSubmitDeckSection } from "@/components/deck-check/player-submit-page";
import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRequestJoinTournament, useTournamentSubmitLanding } from "@/hooks/use-tournaments";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

export function TournamentSubmitPage({ token }: { token: string }) {
  const { data } = useTournamentSubmitLanding(token);
  const requestJoin = useRequestJoinTournament();
  const [joined, setJoined] = useState(false);

  async function handleJoin() {
    let result;
    try {
      result = await requestJoin.mutateAsync({ token });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send your request");
      return;
    }
    setJoined(true);
    toast.success(result.alreadyJoined ? "You are already registered" : "Request sent");
  }

  // When self-registration is closed, the link only takes a deck from someone
  // who already holds a spot (claimed via the personal link). A stranger is
  // pointed at their claim link instead of a dead "not open" message.
  const canSubmitDeck =
    data.deckExpected && (data.selfRegistrationOpen || data.viewerIsParticipant);

  // Widen the column only when the deck submission form is shown; the
  // join/claim-only landing stays narrow.
  const maxWidth = canSubmitDeck ? "max-w-2xl" : "max-w-md";

  return (
    <>
      <PageTopBarSticky maxWidth={canSubmitDeck ? "4xl" : "md"}>
        <PageTopBar>
          <PageTopBarTitle>Join tournament</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("mx-auto flex w-full flex-col gap-6", maxWidth, PAGE_PADDING_NO_TOP)}>
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
            {joined ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckIcon className="size-4" /> Your request was sent. The host will review it.
              </div>
            ) : data.selfRegistrationOpen ? (
              <Button onClick={handleJoin} disabled={requestJoin.isPending}>
                Request to join
              </Button>
            ) : data.viewerIsParticipant ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckIcon className="size-4" /> You have a spot in this event.
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                The organizer adds players directly. Open the personal claim link they sent you to
                take your spot.
              </p>
            )}
            <Button variant="ghost" render={<Link to="/tournaments" />} className="w-fit">
              Go to my tournaments
            </Button>
          </CardContent>
        </Card>

        {canSubmitDeck ? <PlayerSubmitDeckSection token={token} /> : null}
      </div>
    </>
  );
}
