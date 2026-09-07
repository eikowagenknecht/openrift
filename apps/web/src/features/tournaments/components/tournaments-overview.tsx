import type { TournamentSummaryResponse } from "@openrift/shared/types/api/tournament";

import { SectionHeading } from "@/components/ui/section-heading";
import { NextEventHero } from "@/features/tournaments/components/next-event-hero";
import { PastEventsTimeline } from "@/features/tournaments/components/past-events-timeline";
import { TournamentCard } from "@/features/tournaments/components/tournament-card";
import {
  compareTournamentsForList,
  partitionTournaments,
} from "@/features/tournaments/lib/tournament-display";

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
  tournaments: TournamentSummaryResponse[];
  noUpcomingText: string;
  showContext?: boolean;
}

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
