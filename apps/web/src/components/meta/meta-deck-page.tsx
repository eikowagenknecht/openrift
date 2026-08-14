import { Link, useNavigate } from "@tanstack/react-router";
import { CopyIcon, InfoIcon } from "lucide-react";

import { PublicDeckSurface } from "@/components/deck/public-deck-surface";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCloneSharedDeck } from "@/hooks/use-decks";
import { useMetaDeck } from "@/hooks/use-meta";
import { useUserId } from "@/lib/auth-session";
import { formatAbsoluteDate } from "@/lib/format-date";
import { formatFinishTier } from "@/lib/meta-format";
import { useLocalDecksStore } from "@/stores/local-decks-store";

/** Short by design: the date shares the hero's title row with the deck name. */
const EVENT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

/**
 * `/meta/decks/$token` — one archived deck, rendered through the same surface
 * the public share page uses. The archive never shows an account owner: the
 * hero byline carries the finish, the player, the record, and the event
 * instead (ADR-014).
 * @returns The archived deck page.
 */
export function MetaDeckPage({ token }: { token: string }) {
  const { data } = useMetaDeck(token);
  const userId = useUserId();
  const isLoggedIn = userId !== null;
  const cloneMutation = useCloneSharedDeck();
  const navigate = useNavigate();

  // Fork, per ADR-014: signed in duplicates the deck server-side, signed out
  // builds the same list as a browser-local deck (ADR-035). Which branch runs
  // follows the deck importer: the presence of a user id, not a session load
  // state.
  const handleFork = async () => {
    if (!isLoggedIn) {
      const store = useLocalDecksStore.getState();
      const localId = store.createDeck(data.deck.format, data.deck.name);
      // createDeck starts with formatConfig null; carry the archived deck's
      // config (and links) over so e.g. a Custom-Region fork keeps its
      // regions, matching what the signed-in clone does server-side.
      store.updateDeck(localId, {
        formatConfig: data.deck.formatConfig,
        links: data.deck.links,
      });
      store.setCards(
        localId,
        data.cards.map((card) => ({
          zone: card.zone,
          cardId: card.cardId,
          quantity: card.quantity,
          preferredPrintingId: card.preferredPrintingId,
        })),
      );
      void navigate({ to: "/decks/$deckId", params: { deckId: localId } });
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
      returnPath={`/meta/decks/${token}`}
      // An archetype-only entry has no page at all, so "partial" is the only
      // status this ever fires on.
      notice={
        data.meta.listStatus === "partial" ? (
          <Alert variant="info">
            <InfoIcon />
            <AlertTitle>This list is incomplete</AlertTitle>
            <AlertDescription>
              The source published the main deck but not the rest, so the battlefields, runes, and
              sideboard you see may be missing cards the pilot actually played.
            </AlertDescription>
          </Alert>
        ) : undefined
      }
      // The archive's byline: never the account that owns the row. It carries
      // the whole event context, since the page shows nothing above the hero.
      heroByline={
        <>
          {formatFinishTier(data.meta.finishTier)} · {data.meta.playerName}
          {data.meta.record !== null && ` (${data.meta.record})`} ·{" "}
          <Link
            to="/meta/$slug"
            params={{ slug: data.meta.event.slug }}
            className="hover:underline"
          >
            {data.meta.event.name}
          </Link>
          {/* The date is the first fact to go: the byline shares its row with
              the deck name, which phones need the width for. */}
          <span className="hidden sm:inline">
            {" · "}
            {formatAbsoluteDate(data.meta.event.eventDate, EVENT_DATE_OPTIONS)}
          </span>
        </>
      }
      heroActions={
        <Button onClick={handleFork} disabled={cloneMutation.isPending}>
          <CopyIcon />
          {cloneMutation.isPending
            ? "Copying…"
            : isLoggedIn
              ? "Fork to my decks"
              : "Open in deck builder"}
        </Button>
      }
    />
  );
}
