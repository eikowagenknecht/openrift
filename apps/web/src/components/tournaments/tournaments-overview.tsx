import type { TournamentSummaryResponse } from "@openrift/shared";

import { NextEventHero } from "@/components/tournaments/next-event-hero";
import { PastEventsTimeline } from "@/components/tournaments/past-events-timeline";
import { TournamentCard } from "@/components/tournaments/tournament-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { compareTournamentsForList, partitionTournaments } from "@/lib/tournament-display";

function UpcomingGrid({ tournaments }: { tournaments: TournamentSummaryResponse[] }) {
  return (
    <ul className="grid gap-3">
      {tournaments.map((tournament) => (
        <li key={tournament.id}>
          <TournamentCard tournament={tournament} />
        </li>
      ))}
    </ul>
  );
}

interface TournamentsOverviewProps {
  /** The tournaments to lay out; must be non-empty (callers own the empty state). */
  tournaments: TournamentSummaryResponse[];
  /** Shown in place of the hero when nothing is upcoming. */
  noUpcomingText: string;
  /**
   * Label each event with its hosting context (group or organization), for
   * the cross-group personal list. The group lens omits it — there the
   * context is the page.
   */
  showContext?: boolean;
}

/**
 * The shared events layout: the next (or live) tournament as a hero tile with
 * a card-art band, further upcoming events as compact cards, and completed or
 * cancelled events down a timeline with winner callouts. Used by the group
 * events lens and the personal tournaments page.
 *
 * @returns The overview content.
 */
export function TournamentsOverview({
  tournaments,
  noUpcomingText,
  showContext = false,
}: TournamentsOverviewProps) {
  const { current, pastOrArchived } = partitionTournaments(tournaments);
  const [hero, ...alsoUpcoming] = current.toSorted((a, b) => compareTournamentsForList(a, b));
  const pastSorted = pastOrArchived.toSorted((a, b) => compareTournamentsForList(a, b));

  return (
    <div className="flex flex-col gap-7">
      {hero ? (
        <NextEventHero tournament={hero} showContext={showContext} />
      ) : (
        <p className="text-muted-foreground">{noUpcomingText}</p>
      )}
      {alsoUpcoming.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading variant="display">Also coming up</SectionHeading>
          <UpcomingGrid tournaments={alsoUpcoming} />
        </section>
      ) : null}
      {pastSorted.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading variant="display" count={pastSorted.length}>
            Past events
          </SectionHeading>
          <PastEventsTimeline tournaments={pastSorted} showContext={showContext} />
        </section>
      ) : null}
    </div>
  );
}
