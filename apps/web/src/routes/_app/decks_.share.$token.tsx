import type { PublicDeckDetailResponse } from "@openrift/shared";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { CopyIcon, UserIcon } from "lucide-react";

import { DeckOverview } from "@/components/deck/deck-overview";
import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCards } from "@/hooks/use-cards";
import { publicDeckQueryOptions, useCloneSharedDeck, usePublicDeck } from "@/hooks/use-decks";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toDeckBuilderCard } from "@/lib/deck-builder-card";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

const FORMAT_LABELS: Record<"constructed" | "freeform", string> = {
  constructed: "Constructed",
  freeform: "Freeform",
};

export const Route = createFileRoute("/_app/decks_/share/$token")({
  head: ({ loaderData }) => {
    const siteUrl = getSiteUrl();
    const data = loaderData as PublicDeckDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Shared deck" });
    }
    const { deck, owner } = data;
    const title = `${deck.name} — ${FORMAT_LABELS[deck.format]} deck`;
    const description =
      deck.description ??
      `A ${FORMAT_LABELS[deck.format]} Riftbound deck shared by ${owner.displayName}.`;
    return seoHead({
      siteUrl,
      title,
      description,
    });
  },
  loader: async ({ context, params }): Promise<PublicDeckDetailResponse> => {
    try {
      return await context.queryClient.ensureQueryData(publicDeckQueryOptions(params.token));
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  component: SharedDeckPage,
  pendingComponent: SharedDeckPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: RouteNotFoundFallback,
});

function SharedDeckPage() {
  const { token } = Route.useParams();
  const { data } = usePublicDeck(token);
  const { data: session } = useSession();
  const deckSharingEnabled = useFeatureEnabled("deck-sharing");
  const cloneMutation = useCloneSharedDeck();
  const navigate = useNavigate();
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = marketplaceOrder[0] ?? "cardtrader";

  const { cardsById } = useCards();

  const builderCards: DeckBuilderCard[] = data.cards
    .map((card) => toDeckBuilderCard(card, cardsById))
    .filter((card): card is DeckBuilderCard => card !== null);

  const handleClone = async () => {
    if (!session?.user) {
      void navigate({
        to: "/login",
        search: { redirect: `/decks/share/${token}`, email: undefined },
      });
      return;
    }
    const result = await cloneMutation.mutateAsync(token);
    void navigate({ to: "/decks/$deckId", params: { deckId: result.deckId } });
  };

  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-6xl flex-col gap-4 py-4`}>
      <header className="border-border flex flex-col gap-2 border-b pb-4">
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <UserIcon className="size-3.5" />
          Shared by {data.owner.displayName}
        </p>
        {data.deck.description && (
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {data.deck.description}
          </p>
        )}
        {deckSharingEnabled && (
          <div>
            <Button onClick={handleClone} disabled={cloneMutation.isPending}>
              <CopyIcon />
              {session?.user ? "Copy to my decks" : "Sign in to copy"}
            </Button>
          </div>
        )}
      </header>

      <DeckOverview
        deck={{ id: data.deck.id, name: data.deck.name, format: data.deck.format }}
        cards={builderCards}
        marketplace={marketplace}
        readOnly
      />

      <footer className="border-border mt-6 border-t pt-3 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          ← Browse OpenRift
        </Link>
      </footer>
    </div>
  );
}

function SharedDeckPending() {
  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-6xl flex-col gap-4 py-4`}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
