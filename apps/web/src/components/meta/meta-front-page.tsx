import type { MetaEventTier } from "@openrift/shared";
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
import { MetaArchiveActivity } from "@/components/meta/meta-archive-activity";
import { MetaArchiveCounts } from "@/components/meta/meta-archive-counts";
import { MetaArchiveSearch } from "@/components/meta/meta-archive-search";
import { MetaContributeBand } from "@/components/meta/meta-contribute-band";
import { MetaEventRow } from "@/components/meta/meta-event-row";
import { MetaFrontEventBlock } from "@/components/meta/meta-front-event-block";
import { MetaScopeBar } from "@/components/meta/meta-scope-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useIsAdmin } from "@/hooks/use-admin";
import { useMetaActivity, useMetaEvents } from "@/hooks/use-meta";
import { useMetaEras } from "@/hooks/use-meta-eras";
import { useMetaSubmissions } from "@/hooks/use-meta-submissions";
import { useUserId } from "@/lib/auth-session";
import { filterMetaEvents, metaEventCountries, metaFrontSections } from "@/lib/meta-front-page";
import type { MetaScope } from "@/lib/meta-scope";
import { CLEARED_SCOPE, isScopeCustomized, nextScopeSearch } from "@/lib/meta-scope";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/meta");

const PREMIER_LIMIT = 3;
const COMPETITIVE_LIMIT = 3;
const COMMUNITY_LIMIT = 5;

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
  accent,
  children,
}: {
  title: string;
  action?: ReactNode;
  /** The tier marker's color class; the untinted sections pass none. */
  accent?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {accent !== undefined && (
          <span aria-hidden="true" className={cn("h-4 w-1 self-center rounded-full", accent)} />
        )}
        <Heading>{title}</Heading>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The "All …" link a tier section carries, opening the event index already
 * narrowed to that tier.
 */
function TierIndexLink({ tiers, count }: { tiers: MetaEventTier[]; count: number }) {
  return (
    <Link
      to="/meta/events"
      search={{ tiers }}
      className="text-primary text-sm font-medium hover:underline"
    >
      Browse all {count}
    </Link>
  );
}

/**
 * `/meta` — the archive's front page: how much is on record, the recent events
 * split by how much they count for (each with the podium the archive holds),
 * what landed lately, and how to add to it.
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
  const { data: activityData } = useMetaActivity();

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
  const sections = metaFrontSections(events);
  const tierCounts = metaFrontSections(allEvents);
  const playerResults = events.reduce((total, event) => total + event.playerRowCount, 0);
  const deckResults = events.reduce((total, event) => total + event.deckCount, 0);
  // The activity list is the whole archive's, so it stands down while the page
  // is narrowed rather than pretending to follow a scope it ignores. Customized
  // rather than restricting: the default era is a slice too, but it is the
  // page's resting state, and the resting page is where the news belongs.
  const showActivity = !isScopeCustomized(search) && (search.q ?? "").trim() === "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Meta Archive</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarButton render={<Link to="/meta/decks" />}>Decklists</PageTopBarButton>
            <PageTopBarButton render={<Link to="/meta/legends" />}>Legends</PageTopBarButton>
            {/* Logged out there is nowhere to send a decklist to, so the pair
                stands down entirely rather than leading somewhere dead. */}
            {userId !== null && (
              <>
                <ContributionsLink />
                <PageTopBarPrimaryButton render={<Link to="/meta/submit" />}>
                  Send a decklist
                </PageTopBarPrimaryButton>
              </>
            )}
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "px-safe flex flex-col gap-8 pt-3 pb-10")}>
        {allEvents.length === 0 ? (
          <MetaEmptyState />
        ) : (
          <>
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <MetaArchiveSearch value={search.q ?? ""} onCommit={setQuery} />
                <MetaScopeBar
                  scope={search}
                  setScope={setScope}
                  clearScope={clearScope}
                  eras={eras}
                  countries={metaEventCountries(allEvents)}
                />
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
                {sections.premier.length > 0 && (
                  <Section
                    title="Premier"
                    accent="bg-border-accent"
                    action={<TierIndexLink tiers={["premier"]} count={tierCounts.premier.length} />}
                  >
                    <Card className="gap-0 p-0">
                      <ul className="divide-border divide-y">
                        {sections.premier.slice(0, PREMIER_LIMIT).map((event) => (
                          <li key={event.id}>
                            <MetaFrontEventBlock event={event} featured />
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </Section>
                )}

                {sections.competitive.length > 0 && (
                  <Section
                    title="Competitive"
                    accent="bg-teal-600 dark:bg-teal-400"
                    action={
                      <TierIndexLink
                        tiers={["competitive"]}
                        count={tierCounts.competitive.length}
                      />
                    }
                  >
                    <Card className="gap-0 p-0">
                      <ul className="divide-border divide-y">
                        {sections.competitive.slice(0, COMPETITIVE_LIMIT).map((event) => (
                          <li key={event.id}>
                            <MetaFrontEventBlock event={event} />
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </Section>
                )}

                {sections.community.length > 0 && (
                  <Section
                    title="Store & casual"
                    accent="bg-muted-foreground/40"
                    action={
                      // Named the whole payload rather than the scoped list
                      // above it, because that is what the page behind the
                      // link opens on.
                      <Link
                        to="/meta/events"
                        className="text-primary text-sm font-medium hover:underline"
                      >
                        Browse all {allEvents.length} events
                      </Link>
                    }
                  >
                    <Card className="gap-0 p-0">
                      <ul className="divide-border divide-y">
                        {sections.community.slice(0, COMMUNITY_LIMIT).map((event) => (
                          <li key={event.id}>
                            <MetaEventRow event={event} />
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </Section>
                )}

                {showActivity && activityData.items.length > 0 && (
                  <Section title="Fresh in the archive">
                    <MetaArchiveActivity items={activityData.items} />
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
