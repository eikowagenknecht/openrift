import type { DeckFormat, DeckZone, MetaDeckDetailResponse } from "@openrift/shared";
import { formatDay, WellKnown } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon, CopyIcon, GitForkIcon, InfoIcon } from "lucide-react";
import { toast } from "sonner";

import { PublicDeckSurface } from "@/components/deck/public-deck-surface";
import { PageTopBarButton, PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { MetaContributors } from "@/components/meta/meta-contributors";
import { MetaDeckArchiveBar } from "@/components/meta/meta-deck-archive-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Medal } from "@/components/ui/podium";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useCloneSharedDeck, useEncodeDeckCards } from "@/hooks/use-decks";
import { useMetaDeck } from "@/hooks/use-meta";
import { useUserId } from "@/lib/auth-session";
import { toEncodeDeckCards } from "@/lib/deck-encode-input";
import {
  archivedDeckIdentity,
  describeIncompleteList,
  medalRank,
  unknownZoneCounts,
} from "@/lib/meta-deck-archive";
import { formatRank, formatRecord } from "@/lib/meta-format";
import type { MetaSubmitSearch } from "@/lib/meta-submit-link";
import { metaSubmitSearchForPlayer } from "@/lib/meta-submit-link";
import { useLocalDecksStore } from "@/stores/local-decks-store";

/** Module scope so the copy handler's `try` stays branch-free (React Compiler). */
function reportEncodeWarnings(warnings: readonly string[]): void {
  if (warnings.length > 0) {
    toast.warning("The deck code left some cards out.", { description: warnings.join(" ") });
  }
}

/**
 * The archive's byline for one entry: the finish, who played it, their record,
 * and the tournament it was played at. Never an account owner — the archive
 * credits a player for the result and a contributor for the typing, and those
 * are two different lines.
 * @returns The byline.
 */
function MetaDeckByline({ meta }: { meta: MetaDeckDetailResponse["meta"] }) {
  const medal = medalRank(meta.rank, meta.rankIsTier);
  const record = formatRecord(meta.wins, meta.losses, meta.draws);
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {medal === null ? formatRank(meta.rank, meta.rankIsTier) : <Medal rank={medal} />}
      <span className="text-foreground font-medium">{meta.playerName}</span>
      {record !== null && <span className="tabular-nums">{record}</span>}
      <span aria-hidden>·</span>
      <Link to="/meta/$slug" params={{ slug: meta.event.slug }} className="hover:underline">
        {meta.event.name}
      </Link>
      {/* The date is the first fact to go: the byline shares its row with the
          deck name, which phones need the width for. */}
      <span aria-hidden className="hidden sm:inline">
        ·
      </span>
      <span className="hidden sm:inline">{formatDay(meta.event.eventDate)}</span>
    </span>
  );
}

/**
 * What the page says about the record itself: which parts of the list the
 * archive holds, and the way to fill in the rest.
 * @returns The callout, or null for a list with nothing missing.
 */
function MetaDeckNotice({
  eventSlug,
  format,
  unknown,
  isLoggedIn,
  search,
}: {
  eventSlug: string;
  format: DeckFormat;
  unknown: ReadonlyMap<DeckZone, number>;
  isLoggedIn: boolean;
  /** The prefill the Complete button carries, so the form opens on this list. */
  search: MetaSubmitSearch;
}) {
  const missing = describeIncompleteList(format, unknown);
  if (missing === null) {
    return null;
  }
  return (
    <Alert variant="info">
      <InfoIcon />
      <AlertTitle>This list is incomplete</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>
          {missing}
          {/* The hero's chip counts the deck the archive holds, which on a
              partial list is not the deck that was played. It has no way to
              say so itself, so the qualification lives here. */}
          {isLoggedIn && " Your collection is compared against the known cards only."}
        </span>
        <Button
          variant="secondary"
          size="sm"
          render={<Link to="/meta/$slug/submit" params={{ slug: eventSlug }} search={search} />}
        >
          Know the missing cards? Complete it
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * `/meta/decks/$token` — one archived deck, rendered through the same surface
 * the public share page uses, with the archive's own frame around it: a trail
 * back to the event, the result the list scored, and the ways to fork it or
 * correct it.
 * @returns The archived deck page.
 */
export function MetaDeckPage({ token }: { token: string }) {
  const { data } = useMetaDeck(token);
  const userId = useUserId();
  const isLoggedIn = userId !== null;
  const cloneMutation = useCloneSharedDeck();
  const encodeMutation = useEncodeDeckCards();
  const { copied, copy } = useCopyToClipboard();
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

  // The archived deck has no server row the viewer may export, so the code
  // comes from the public stateless encoder — the same codecs the owner's
  // export runs.
  const encodeCards = toEncodeDeckCards(data.cards);
  const handleCopyCode = async () => {
    try {
      const encoded = await encodeMutation.mutateAsync({ cards: encodeCards });
      await copy(encoded.code);
      // A partial list is exactly where a code comes back short, and the
      // clipboard write is not a mutation the global handler ever sees.
      reportEncodeWarnings(encoded.warnings);
    } catch {
      /* Reported by the global mutation error toast. */
    }
  };

  const unknown = unknownZoneCounts(data.cards, data.deck.format, data.meta.listStatus);
  const forkLabel = isLoggedIn ? "Fork to my decks" : "Open in deck builder";

  const identity = archivedDeckIdentity(data.cards);
  // `archivedDeckIdentity` falls back to the champion for a list with no legend
  // card, which is right for the title and wrong for a param the form prints as
  // "the archive has them on". Only a real legend zone travels, which is also
  // what a standings row sends.
  const legend = data.cards.some((card) => card.zone === WellKnown.deckZone.LEGEND)
    ? identity
    : null;
  // The entry as the standings hold it, so both ways in open the form already
  // knowing the player, the finish, the record, and the list itself.
  const entry = {
    playerName: data.meta.playerName,
    rank: data.meta.rank,
    rankIsTier: data.meta.rankIsTier,
    wins: data.meta.wins,
    losses: data.meta.losses,
    draws: data.meta.draws,
    legend,
    shareToken: token,
  };

  return (
    <PublicDeckSurface
      data={data}
      isLoggedIn={isLoggedIn}
      returnPath={`/meta/decks/${token}`}
      topBar={
        <MetaDeckArchiveBar
          event={data.meta.event}
          identity={identity}
          deckName={data.deck.name}
          listStatus={data.meta.listStatus}
          actions={
            <>
              <PageTopBarButton onClick={handleCopyCode} disabled={encodeMutation.isPending}>
                {copied ? <CheckIcon /> : <CopyIcon />}
                {/* Kept in the accessibility tree on phones, where the bar has
                    room for the icon alone. */}
                <span className="sr-only sm:not-sr-only">
                  {copied ? "Copied" : "Copy deck code"}
                </span>
              </PageTopBarButton>
              <PageTopBarPrimaryButton
                onClick={handleFork}
                disabled={cloneMutation.isPending}
                aria-label={cloneMutation.isPending ? "Copying…" : forkLabel}
              >
                <GitForkIcon />
                <span className="hidden sm:inline">
                  {cloneMutation.isPending ? "Copying…" : forkLabel}
                </span>
                <span className="sm:hidden">{cloneMutation.isPending ? "Copying…" : "Fork"}</span>
              </PageTopBarPrimaryButton>
            </>
          }
        />
      }
      // Empty side zones on a partial list are holes in the record, not zones
      // the player left empty, so they keep their slots and say so.
      unknownZoneCounts={unknown}
      notice={
        <MetaDeckNotice
          eventSlug={data.meta.event.slug}
          format={data.deck.format}
          unknown={unknown}
          isLoggedIn={isLoggedIn}
          search={metaSubmitSearchForPlayer(entry, "completion")}
        />
      }
      footer={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <MetaContributors contributors={data.meta.contributors} />
          <Link
            to="/meta/$slug/submit"
            params={{ slug: data.meta.event.slug }}
            search={metaSubmitSearchForPlayer(entry, "correction")}
            className="text-primary ml-auto text-sm hover:underline"
          >
            Something wrong? Suggest a correction
          </Link>
        </div>
      }
      heroByline={<MetaDeckByline meta={data.meta} />}
    />
  );
}
