import type { TournamentSummaryResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CalendarIcon, LayersIcon, PlusIcon, TrophyIcon, UsersIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import {
  PageDescription,
  PageTopBar,
  PageTopBarActions,
  PageTopBarPrimaryButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useTournaments } from "@/hooks/use-tournaments";
import {
  compareTournamentsForList,
  EFFECTIVE_STATE_LABEL,
  effectiveTournamentState,
  formatTournamentDate,
  primaryViewerRole,
  VIEWER_ROLE_LABEL,
} from "@/lib/tournament-display";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

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
                {formatTournamentDate(tournament.startsAt)}
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
          <Badge variant="secondary">{EFFECTIVE_STATE_LABEL[state]}</Badge>
          {role ? <Badge variant="outline">{VIEWER_ROLE_LABEL[role]}</Badge> : null}
          {tournament.host.type === "organization" ? (
            <Badge variant="outline">{tournament.host.displayName}</Badge>
          ) : null}
          {tournament.pendingRequestCount > 0 ? (
            <Badge variant="count" aria-label={`${tournament.pendingRequestCount} pending`}>
              {tournament.pendingRequestCount}
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </CardLink>
  );
}

export function TournamentsListPage() {
  const { data } = useTournaments();
  const items = data.items.toSorted((a, b) => compareTournamentsForList(a, b));

  return (
    <>
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar>
          <PageTopBarTitle>Tournaments</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarPrimaryButton render={<Link to="/tournaments/new" />}>
              <PlusIcon /> New tournament
            </PageTopBarPrimaryButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        <PageDescription>Tournaments you host, judge, or joined.</PageDescription>

        {items.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={TrophyIcon}
            title="No tournaments yet"
            description="Create one to run pods, standings, deck submission, deck check, and judges (turn on only the parts you need), or join an event through its registration link."
          >
            <Link to="/tournaments/new" className={buttonVariants({ variant: "default" })}>
              <PlusIcon />
              New tournament
            </Link>
          </EmptyState>
        ) : (
          <ul className="grid gap-3">
            {items.map((tournament) => (
              <li key={tournament.id}>
                <TournamentCard tournament={tournament} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
