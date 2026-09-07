import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { CopyIcon } from "lucide-react";

import { PublicDeckActionsMenu } from "@/components/deck/public-deck-actions-menu";
import { PublicDeckSurface } from "@/components/deck/public-deck-surface";
import { Button } from "@/components/ui/button";
import { useCloneSharedDeck, usePublicDeck } from "@/hooks/use-decks";
import { useSession } from "@/lib/auth-session";

export const Route = createLazyFileRoute("/_app/decks_/share/$token")({
  component: SharedDeckPage,
});

function SharedDeckPage() {
  const { token } = Route.useParams();
  const { data } = usePublicDeck(token);
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const cloneMutation = useCloneSharedDeck();
  const navigate = useNavigate();

  const handleClone = async () => {
    if (!isLoggedIn) {
      void navigate({
        to: "/login",
        search: { redirect: `/decks/share/${token}`, email: undefined },
      });
      return;
    }
    try {
      const result = await cloneMutation.mutateAsync(token);
      void navigate({ to: "/decks/$deckId", params: { deckId: result.deckId } });
    } catch {
      /* Reported by the global mutation error toast. */
    }
  };

  return (
    <PublicDeckSurface
      data={data}
      isLoggedIn={isLoggedIn}
      returnPath={`/decks/share/${token}`}
      heroByline={<>by {data.owner.displayName}</>}
      heroActions={
        <>
          <Button onClick={() => void handleClone()} disabled={cloneMutation.isPending}>
            <CopyIcon />
            {cloneMutation.isPending
              ? "Copying…"
              : isLoggedIn
                ? "Copy to my decks"
                : "Sign in to copy"}
          </Button>
          <PublicDeckActionsMenu
            deckId={data.deck.id}
            deckName={data.deck.name}
            shareToken={token}
            updatedAt={data.deck.updatedAt}
            cards={data.cards}
          />
        </>
      }
    />
  );
}
