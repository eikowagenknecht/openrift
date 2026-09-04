import type { DeckFormat, DeckZone } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CopyIcon, InfoIcon } from "lucide-react";

import { PublicDeckActionsMenu } from "@/components/deck/public-deck-actions-menu";
import { PublicDeckSurface } from "@/components/deck/public-deck-surface";
import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { MetaContributors } from "@/components/meta/meta-contributors";
import { MetaDeckArchiveBar } from "@/components/meta/meta-deck-archive-bar";
import { MetaDeckFinish, MetaDeckHeading } from "@/components/meta/meta-deck-hero";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCopyArchivedDeck } from "@/hooks/use-copy-archived-deck";
import { useMetaDeck } from "@/hooks/use-meta";
import {
  archivedDeckIdentity,
  describeIncompleteList,
  unknownZoneCounts,
} from "@/lib/meta-deck-archive";
import type { MetaSubmitSearch } from "@/lib/meta-submit-link";
import { metaSubmitSearchForPlayer } from "@/lib/meta-submit-link";

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
  const {
    copy: copyToMyDecks,
    isPending: copyPending,
    isLoggedIn,
    label: copyLabel,
  } = useCopyArchivedDeck();
  const handleCopyToMyDecks = () => {
    void copyToMyDecks({ token, deck: data.deck, cards: data.cards });
  };

  const unknown = unknownZoneCounts(data.cards, data.deck.format, data.meta.listStatus);

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
              <PageTopBarPrimaryButton
                onClick={handleCopyToMyDecks}
                disabled={copyPending}
                aria-label={copyPending ? "Copying…" : copyLabel}
              >
                <CopyIcon />
                <span className="hidden sm:inline">{copyPending ? "Copying…" : copyLabel}</span>
                <span className="sm:hidden">{copyPending ? "Copying…" : "Copy"}</span>
              </PageTopBarPrimaryButton>
              <PublicDeckActionsMenu
                deckId={data.deck.id}
                deckName={data.deck.name}
                shareToken={token}
                updatedAt={data.deck.updatedAt}
                cards={data.cards}
                inTopBar
              />
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
      heroLead={<MetaDeckFinish meta={data.meta} />}
      heroHeading={<MetaDeckHeading meta={data.meta} identity={identity} />}
    />
  );
}
