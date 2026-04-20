import type { DeckCardResponse, DeckZone, PublicDeckDetailResponse } from "@openrift/shared";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { CopyIcon, UserIcon } from "lucide-react";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCards } from "@/hooks/use-cards";
import { publicDeckQueryOptions, useCloneSharedDeck, usePublicDeck } from "@/hooks/use-decks";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { useSession } from "@/lib/auth-session";
import { ZONE_LABELS } from "@/lib/deck-zone-labels";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_PADDING } from "@/lib/utils";

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
  const cloneDeckSharingEnabled = useFeatureEnabled("deck-sharing");
  const cloneMutation = useCloneSharedDeck();
  const navigate = useNavigate();

  const { cardsById } = useCards();

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

  const cardsByZone = Map.groupBy(data.cards, (card) => card.zone);
  const zones: DeckZone[] = [
    "legend",
    "champion",
    "battlefield",
    "runes",
    "main",
    "sideboard",
    "overflow",
  ];
  const totalCards = data.cards
    .filter((card) => card.zone !== "overflow")
    .reduce((sum, card) => sum + card.quantity, 0);

  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-5xl flex-col gap-4`}>
      <header className="border-border flex flex-col gap-2 border-b pb-4">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold">{data.deck.name}</h1>
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {FORMAT_LABELS[data.deck.format]} · {totalCards} cards
          </span>
        </div>
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
          <UserIcon className="size-4" />
          Shared by {data.owner.displayName}
        </p>
        {data.deck.description && (
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {data.deck.description}
          </p>
        )}
        {cloneDeckSharingEnabled && (
          <div className="mt-2">
            <Button onClick={handleClone} disabled={cloneMutation.isPending}>
              <CopyIcon />
              {session?.user ? "Copy to my decks" : "Sign in to copy"}
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-col gap-4">
        {zones
          .filter((zone) => (cardsByZone.get(zone)?.length ?? 0) > 0)
          .map((zone) => (
            <SharedZoneSection
              key={zone}
              zone={zone}
              cards={cardsByZone.get(zone) ?? []}
              cardsById={cardsById}
            />
          ))}
        {data.cards.length === 0 && (
          <p className="text-muted-foreground text-sm italic">This deck has no cards yet.</p>
        )}
      </div>

      <footer className="border-border mt-6 border-t pt-3 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          ← Browse OpenRift
        </Link>
      </footer>
    </div>
  );
}

function SharedZoneSection({
  zone,
  cards,
  cardsById,
}: {
  zone: DeckZone;
  cards: DeckCardResponse[];
  cardsById: Record<string, { name: string }>;
}) {
  const total = cards.reduce((sum, card) => sum + card.quantity, 0);
  return (
    <section>
      <h2 className="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">
        {ZONE_LABELS[zone]} ({total})
      </h2>
      <ul className="flex flex-col gap-1">
        {cards.map((card) => (
          <li key={`${card.cardId}-${card.zone}`} className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-6 text-right font-mono">{card.quantity}×</span>
            <span>{cardsById[card.cardId]?.name ?? "Unknown card"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SharedDeckPending() {
  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-5xl flex-col gap-4`}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
