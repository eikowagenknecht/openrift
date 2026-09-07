import type { TournamentSummaryResponse } from "@openrift/shared";
import { formatDayTimeLocal } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CalendarIcon, LayersIcon, TrophyIcon, UsersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { useDeckFormatList } from "@/hooks/use-enums";
import {
  EFFECTIVE_STATE_LABEL,
  VIEWER_ROLE_LABEL,
  effectiveTournamentState,
  primaryViewerRole,
} from "@/lib/tournament-display";

export function TournamentCard({ tournament }: { tournament: TournamentSummaryResponse }) {
  const role = primaryViewerRole(tournament.myRoles);
  const state = effectiveTournamentState(tournament.startsAt, tournament.endsAt, tournament.status);
  const { labels: formatLabels } = useDeckFormatList();
  return (
    <CardLink render={<Link to="/tournaments/$id" params={{ id: tournament.id }} />}>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <TrophyIcon className="text-muted-foreground size-5 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-base font-medium">{tournament.name}</span>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-0.5">
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
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          <Badge variant={state === "in_progress" ? "subtle" : "secondary"}>
            {EFFECTIVE_STATE_LABEL[state]}
          </Badge>
          {role ? <Badge variant="outline">{VIEWER_ROLE_LABEL[role]}</Badge> : null}
          {tournament.host.type === "organization" ? (
            <Badge variant="outline">{tournament.host.displayName}</Badge>
          ) : null}
          {tournament.pendingRequestCount > 0 ? (
            <Badge variant="warning">
              {tournament.pendingRequestCount} pending request
              {tournament.pendingRequestCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </CardLink>
  );
}
