import type { TournamentSummaryResponse, TournamentWinner } from "@openrift/shared";
import { dateLeafParts, formatDayTimeLocal } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CalendarIcon, LayersIcon, TrophyIcon, UsersIcon } from "lucide-react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { ParticipantFacepile } from "@/components/tournaments/participant-facepile";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { DateLeaf } from "@/components/ui/date-leaf";
import { useDeckFormatList } from "@/hooks/use-enums";
import { tournamentContextLabel } from "@/lib/tournament-display";

function WinnerChip({ winner }: { winner: TournamentWinner }) {
  return (
    <span className="border-border-accent/40 bg-border-accent/10 flex shrink-0 items-center gap-2 rounded-md border py-1 pr-2.5 pl-2">
      <TrophyIcon className="text-border-accent size-3.5 shrink-0" aria-hidden="true" />
      {winner.legendImageId ? (
        <CardArtThumb shape="strip" imageId={winner.legendImageId} className="h-7" />
      ) : null}
      <span className="text-sm">
        <span className="sr-only">Winner: </span>
        <span className="font-medium">{winner.name}</span>
      </span>
    </span>
  );
}

function PastEventCard({
  tournament,
  showContext,
}: {
  tournament: TournamentSummaryResponse;
  showContext: boolean;
}) {
  const { labels: formatLabels } = useDeckFormatList();
  return (
    <CardLink render={<Link to="/tournaments/$id" params={{ id: tournament.id }} />}>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="truncate text-base font-medium">{tournament.name}</span>
            {tournament.status === "cancelled" ? <Badge variant="muted">Cancelled</Badge> : null}
            {showContext && tournamentContextLabel(tournament) ? (
              <Badge variant="outline" className="max-sm:hidden">
                {tournamentContextLabel(tournament)}
              </Badge>
            ) : null}
          </span>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm">
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="size-4 shrink-0" />
              {formatDayTimeLocal(tournament.startsAt)}
            </span>
            {tournament.deckFormat ? (
              <span className="flex items-center gap-1.5">
                <LayersIcon className="size-4 shrink-0" />
                {formatLabels[tournament.deckFormat]}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              <UsersIcon className="size-4 shrink-0" />
              {tournament.participantCount} participant
              {tournament.participantCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          {tournament.winner ? <WinnerChip winner={tournament.winner} /> : null}
          <ParticipantFacepile
            preview={tournament.participantPreview}
            totalCount={tournament.participantCount}
            size="sm"
            className="max-sm:hidden"
          />
        </div>
      </CardContent>
    </CardLink>
  );
}

export function PastEventsTimeline({
  tournaments,
  showContext = false,
}: {
  tournaments: TournamentSummaryResponse[];
  showContext?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {tournaments.map((tournament) => {
        const leaf = dateLeafParts(tournament.startsAt);
        return (
          <li
            key={tournament.id}
            className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-3"
          >
            <DateLeaf month={leaf.month} day={leaf.day} size="sm" className="mt-2" />
            <PastEventCard tournament={tournament} showContext={showContext} />
          </li>
        );
      })}
    </ul>
  );
}
