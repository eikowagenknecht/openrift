import type { MetaEventSummary, MetaEventTier } from "@openrift/shared";
import { dateLeafPartsUtc } from "@openrift/shared";
import { Link, getRouteApi } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  LayersIcon,
  SwordsIcon,
  TrophyIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { Heading } from "@/components/heading";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
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
import { MetaUpcomingRow } from "@/components/meta/meta-upcoming-row";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { DateLeaf } from "@/components/ui/date-leaf";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useIsAdmin } from "@/hooks/use-admin";
import { useMetaActivity, useMetaEvents } from "@/hooks/use-meta";
import { useMetaEras } from "@/hooks/use-meta-eras";
import { useMetaSubmissions } from "@/hooks/use-meta-submissions";
import { useUserId } from "@/lib/auth-session";
import {
  filterMetaEvents,
  metaEventCountries,
  metaFrontSections,
  metaTierCounts,
} from "@/lib/meta-front-page";
import type { MetaScope } from "@/lib/meta-scope";
import { CLEARED_SCOPE, isScopeCustomized, nextScopeSearch, UNSCOPED } from "@/lib/meta-scope";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/meta");

const ARCHIVE_INDEXES = [
  {
    to: "/meta/decks",
    icon: LayersIcon,
    title: "Decklists",
    description: "Every list the archive holds, filterable by legend, domain and card.",
  },
  {
    to: "/meta/legends",
    icon: SwordsIcon,
    title: "Legends",
    description: "How each legend has finished, and the players who took it there.",
  },
] as const;

const PREMIER_LIMIT = 3;
const COMPETITIVE_LIMIT = 4;
const COMMUNITY_LIMIT = 5;
const UPCOMING_LIMIT = 6;

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

/** Under the counts, not the top bar: both are places to browse, not actions on this page. */
function ArchiveIndexTiles() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ARCHIVE_INDEXES.map((index) => (
        <CardLink key={index.to} render={<Link to={index.to} />} size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <index.icon className="text-muted-foreground size-4" />
              {index.title}
              <ChevronRightIcon aria-hidden className="text-muted-foreground ml-auto size-4" />
            </CardTitle>
            <CardDescription>{index.description}</CardDescription>
          </CardHeader>
        </CardLink>
      ))}
    </div>
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
  id,
  title,
  action,
  accent,
  children,
}: {
  id?: string;
  title: string;
  action?: ReactNode;
  /** The tier marker's color class; the untinted sections pass none. */
  accent?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-[calc(var(--header-height)+0.75rem)] flex-col gap-3">
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
 * The "All …" link a tier section carries, opening the event index narrowed to
 * that tier and nothing else. The count is of the whole archive, so the link
 * has to clear the index's default era and format or it lands short of it.
 */
function TierIndexLink({ tiers, count }: { tiers: MetaEventTier[]; count: number }) {
  return (
    <Link
      to="/meta/events"
      search={{ ...UNSCOPED, tiers }}
      className="text-primary text-sm font-medium hover:underline"
    >
      Browse all {count}
    </Link>
  );
}

/** Stands in for the rail below `lg`, where the rail follows the tier sections. */
function UpcomingTeaser({ next, count }: { next: MetaEventSummary; count: number }) {
  const leaf = dateLeafPartsUtc(next.eventDate);

  return (
    <Card className="gap-0 p-0 lg:hidden">
      <Link
        from="/meta"
        search={(prev) => prev}
        hash="coming-up"
        hashScrollIntoView
        className="hover:bg-muted/50 focus-visible:ring-ring/50 flex items-center gap-3 px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:-outline-offset-2"
      >
        <DateLeaf month={leaf.month} day={leaf.day} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">
            <span className="font-semibold">Next up</span>
            <span className="text-muted-foreground"> · </span>
            {next.name}
          </span>
          <span className="text-muted-foreground text-xs">
            {count === 1 ? "1 upcoming event" : `${count} upcoming events`}
          </span>
        </span>
        <ChevronDownIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
      </Link>
    </Card>
  );
}

/**
 * `/meta` — the archive's front page: how much is on record, the events with
 * results split by how much they count for (each with the podium the archive
 * holds), the events still to come in the rail beside them, what landed lately,
 * and how to add to it. Nothing here rates a deck, a card, or a legend against
 * another.
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
  const tierCounts = metaTierCounts(allEvents);
  const hasResults =
    sections.premier.length > 0 || sections.competitive.length > 0 || sections.community.length > 0;
  const playerResults = events.reduce((total, event) => total + event.playerRowCount, 0);
  const deckResults = events.reduce((total, event) => total + event.deckCount, 0);
  // The activity feed is archive-wide, so it hides while the page is narrowed.
  const showActivity = !isScopeCustomized(search) && (search.q ?? "").trim() === "";
  const hasRail = sections.upcoming.length > 0 || (showActivity && activityData.items.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Meta Archive</PageTopBarTitle>
          {/* The ask lives in the contribute band at the foot of the page, which
              says what is wanted; a bare button here said only where to go. */}
          <PageTopBarActions>{userId !== null && <ContributionsLink />}</PageTopBarActions>
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
                  showTier={false}
                />
              </div>
              <MetaArchiveCounts
                eventCount={events.length}
                playerResultCount={playerResults}
                deckCount={deckResults}
              />
              <ArchiveIndexTiles />
            </div>

            {events.length === 0 ? (
              <>
                <Empty>
                  <EmptyHeader>
                    <EmptyDescription>No archived events match this scope.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
                <MetaContributeBand />
              </>
            ) : (
              <>
                {sections.upcoming.length > 0 && (
                  <UpcomingTeaser next={sections.upcoming[0]} count={sections.upcoming.length} />
                )}

                <div
                  className={cn(
                    "flex flex-col gap-8",
                    hasRail &&
                      "lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-8",
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-8">
                    {hasResults ? (
                      <>
                        {sections.premier.length > 0 && (
                          <Section
                            title="Premier"
                            accent="bg-border-accent"
                            action={
                              <TierIndexLink tiers={["premier"]} count={tierCounts.premier} />
                            }
                          >
                            <Card className="gap-0 p-0">
                              <ul className="divide-border divide-y">
                                {sections.premier.slice(0, PREMIER_LIMIT).map((event) => (
                                  <li key={event.id}>
                                    <MetaFrontEventBlock event={event} />
                                  </li>
                                ))}
                              </ul>
                            </Card>
                          </Section>
                        )}

                        {sections.competitive.length > 0 && (
                          <Section
                            title="Competitive"
                            accent="bg-primary"
                            action={
                              <TierIndexLink
                                tiers={["competitive"]}
                                count={tierCounts.competitive}
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
                              <Link
                                to="/meta/events"
                                search={UNSCOPED}
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
                      </>
                    ) : (
                      <Empty>
                        <EmptyHeader>
                          <EmptyDescription>
                            No results on file for this scope yet.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </div>

                  {hasRail && (
                    <aside className="flex flex-col gap-8 lg:sticky lg:top-[calc(var(--header-height)+0.75rem)] lg:col-start-2 lg:row-span-2 lg:row-start-1">
                      {sections.upcoming.length > 0 && (
                        <Section
                          id="coming-up"
                          title="Coming up"
                          action={
                            <Link
                              to="/meta/events"
                              search={{ ...search, holds: "upcoming", by: "date", dir: "asc" }}
                              className="text-primary text-sm font-medium hover:underline"
                            >
                              All {sections.upcoming.length}
                            </Link>
                          }
                        >
                          <Card className="gap-0 p-0">
                            <ul className="divide-border divide-y">
                              {sections.upcoming.slice(0, UPCOMING_LIMIT).map((event) => (
                                <li key={event.id}>
                                  <MetaUpcomingRow event={event} />
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
                    </aside>
                  )}

                  <div className="lg:col-start-1">
                    <MetaContributeBand />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
