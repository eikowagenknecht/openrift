import type { DeckFormat, DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";
import { Link } from "@tanstack/react-router";
import { CopyIcon, InfoIcon } from "lucide-react";

import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PublicDeckActionsMenu } from "@/features/decks/components/public-deck-actions-menu";
import { PublicDeckSurface } from "@/features/decks/components/public-deck-surface";
import { useCopyArchivedDeck } from "@/features/decks/hooks/use-copy-archived-deck";
import { MetaContributors } from "@/features/meta/components/meta-contributors";
import { MetaDeckArchiveBar } from "@/features/meta/components/meta-deck-archive-bar";
import { MetaDeckFinish, MetaDeckHeading } from "@/features/meta/components/meta-deck-hero";
import { useMetaDeck } from "@/features/meta/hooks/use-meta";
import {
  archivedDeckIdentity,
  describeIncompleteList,
  unknownZoneCounts,
} from "@/features/meta/lib/meta-deck-archive";
import type { MetaSubmitSearch } from "@/features/meta/lib/meta-submit-link";
import { metaSubmitSearchForPlayer } from "@/features/meta/lib/meta-submit-link";

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
          {/* The hero chip counts the deck the archive holds, not the deck as played. */}
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
  // archivedDeckIdentity falls back to the champion for a list with no legend card;
  // only a real legend zone should travel into the form param.
  const legend = data.cards.some((card) => card.zone === WellKnown.deckZone.LEGEND)
    ? identity
    : null;
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
