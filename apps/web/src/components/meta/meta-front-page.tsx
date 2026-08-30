import { Link, getRouteApi } from "@tanstack/react-router";
import { TrophyIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { Heading } from "@/components/heading";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarPrimaryButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { MetaArchiveCounts } from "@/components/meta/meta-archive-counts";
import { MetaArchiveDeckTile } from "@/components/meta/meta-archive-deck-tile";
import { MetaArchiveSearch } from "@/components/meta/meta-archive-search";
import { MetaContributeBand } from "@/components/meta/meta-contribute-band";
import { MetaEventRow } from "@/components/meta/meta-event-row";
import { MetaScopeBar } from "@/components/meta/meta-scope-bar";
import { MetaWinnerCard } from "@/components/meta/meta-winner-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useIsAdmin } from "@/hooks/use-admin";
import { useMetaDecks, useMetaEvents } from "@/hooks/use-meta";
import { useMetaEras } from "@/hooks/use-meta-eras";
import { useMetaSubmissions } from "@/hooks/use-meta-submissions";
import { useUserId } from "@/lib/auth-session";
import {
  filterMetaEvents,
  latestMetaWinners,
  metaDecksForEvents,
  metaEventCountries,
  metaTiersByEventSlug,
} from "@/lib/meta-front-page";
import type { MetaScope } from "@/lib/meta-scope";
import { CLEARED_SCOPE, nextScopeSearch } from "@/lib/meta-scope";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/meta");

const WINNER_LIMIT = 3;
const RECENT_EVENT_LIMIT = 6;
const NEWEST_DECK_LIMIT = 8;

/**
 * The link to a contributor's own ledger, which only exists once they have sent
 * something. Signed-in visitors who have never contributed get an action that
 * would only ever show them an empty page.
 */
function ContributionsLink() {
  const { data } = useMetaSubmissions();
  const hasSubmissions = data?.pages.some((page) => page.items.length > 0) === true;
  if (!hasSubmissions) {
    return null;
  }
  return (
    <PageTopBarButton render={<Link to="/meta/submissions" />}>Your contributions</PageTopBarButton>
  );
}

/** @returns The empty archive's state, with a create CTA only an admin sees. */
function MetaEmptyState() {
  const { data: isAdmin } = useIsAdmin();
  return (
    <EmptyState
      className="py-12"
      icon={TrophyIcon}
      title="No events archived yet"
      description="Tournament results land here as soon as they are entered."
    >
      {isAdmin === true && <Button render={<Link to="/admin/meta" />}>Add an event</Button>}
    </EmptyState>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Heading>{title}</Heading>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * `/meta` — the archive's front page: how much is on record, who last won what,
 * which events and decklists landed most recently, and how to add to it.
 *
 * Every number here counts archived facts. Nothing on this page rates a deck,
 * a card, or a legend against another.
 */
export function MetaFrontPage() {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const userId = useUserId();
  const eras = useMetaEras();
  const { data: eventsData } = useMetaEvents();
  const { data: decksData } = useMetaDecks();

  const setScope = (patch: Partial<MetaScope>) => {
    void navigate({ search: (prev) => nextScopeSearch(prev, patch) });
  };
  // Reset clears the text field too: the scope bar's control is the only one on
  // the row, and leaving a search behind would look like a reset that did not.
  const clearScope = () => {
    void navigate({ search: (prev) => nextScopeSearch({ ...prev, q: undefined }, CLEARED_SCOPE) });
  };
  const setQuery = (next: string) => {
    void navigate({ search: (prev) => nextScopeSearch({ ...prev, q: next }, {}) });
  };

  const allEvents = eventsData.events;
  const events = filterMetaEvents(allEvents, { scope: search, eras, search: search.q });
  const decks = metaDecksForEvents(decksData.decks, events, NEWEST_DECK_LIMIT);
  const tiers = metaTiersByEventSlug(events);
  const winners = latestMetaWinners(events, WINNER_LIMIT);
  const playerResults = events.reduce((total, event) => total + event.playerRowCount, 0);
  const deckResults = events.reduce((total, event) => total + event.deckCount, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Meta Archive</PageTopBarTitle>
          {/* Logged out there is nowhere to send a decklist to, so the pair
              stands down entirely rather than leading somewhere dead. */}
          {userId !== null && (
            <PageTopBarActions>
              <ContributionsLink />
              <PageTopBarPrimaryButton render={<Link to="/meta/submit" />}>
                Send a decklist
              </PageTopBarPrimaryButton>
            </PageTopBarActions>
          )}
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "px-safe flex flex-col gap-8 pt-3 pb-10")}>
        {allEvents.length === 0 ? (
          <MetaEmptyState />
        ) : (
          <>
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <MetaScopeBar
                  scope={search}
                  setScope={setScope}
                  clearScope={clearScope}
                  eras={eras}
                  countries={metaEventCountries(allEvents)}
                />
                <MetaArchiveSearch value={search.q ?? ""} onCommit={setQuery} />
              </div>
              <MetaArchiveCounts
                eventCount={events.length}
                playerResultCount={playerResults}
                deckCount={deckResults}
              />
            </div>

            {events.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyDescription>No archived events match this scope.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                {winners.length > 0 && (
                  <Section title="Latest winners">
                    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {winners.map((event) => (
                        <li key={event.id}>
                          <MetaWinnerCard event={event} />
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                <Section
                  title="Recent events"
                  action={
                    // Both "Browse all" counts name the whole payload rather
                    // than the scoped list above them, because that is what the
                    // page behind the link opens on.
                    <Link
                      to="/meta/events"
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      Browse all {allEvents.length}
                    </Link>
                  }
                >
                  <Card className="gap-0 p-0">
                    <ul className="divide-border divide-y">
                      {events.slice(0, RECENT_EVENT_LIMIT).map((event) => (
                        <li key={event.id}>
                          <MetaEventRow event={event} />
                        </li>
                      ))}
                    </ul>
                  </Card>
                </Section>

                {decks.length > 0 && (
                  <Section
                    title="Newest decklists"
                    action={
                      <Link
                        to="/meta/decks"
                        className="text-primary text-sm font-medium hover:underline"
                      >
                        Browse all {decksData.decks.length}
                      </Link>
                    }
                  >
                    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                      {decks.map((deck) => (
                        <li key={deck.deckId}>
                          <MetaArchiveDeckTile deck={deck} tier={tiers.get(deck.event.slug)} />
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </>
            )}

            <MetaContributeBand />
          </>
        )}
      </div>
    </div>
  );
}
