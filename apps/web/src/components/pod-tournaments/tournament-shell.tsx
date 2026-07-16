import type { PodReportResponse, PodTournamentStatus } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { useTournamentReport } from "@/hooks/use-tournaments";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

const STATUS_LABEL: Record<PodTournamentStatus, string> = {
  setup: "Not started",
  running: "In progress",
  completed: "Completed",
};

export type ReportTab = "rounds" | "standings";

function tabLinkClass(isActive: boolean): string {
  return cn(
    "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium transition-colors",
    isActive
      ? "border-primary text-foreground"
      : "text-muted-foreground hover:text-foreground border-transparent",
  );
}

function ReportTabLink({
  to,
  token,
  label,
  isActive,
}: {
  to: "/tournaments/report/$token" | "/tournaments/report/$token/standings";
  token: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      to={to}
      params={{ token }}
      aria-current={isActive ? "page" : undefined}
      className={tabLinkClass(isActive)}
    >
      {label}
    </Link>
  );
}

/**
 * Participant follow-along frame: loads the token's report payload and wraps the
 * active tab in the shared header + route-based tab nav.
 * @returns The framed participant page.
 */
export function TournamentReportFrame({
  token,
  active,
  render,
}: {
  token: string;
  active: ReportTab;
  render: (data: PodReportResponse) => ReactNode;
}) {
  const { data } = useTournamentReport(token);
  // While a round is open the report query polls (see tournamentReportQueryOptions),
  // so the page is live — the badge tells players they don't need to reload.
  const live = data.rounds.some((round) => round.status === "reporting");
  return (
    <>
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar>
          <PageTopBarTitle>{data.tournamentName}</PageTopBarTitle>
          <Badge variant="secondary" className="shrink-0">
            {STATUS_LABEL[data.status]}
          </Badge>
          {live ? (
            <Badge variant="success" className="shrink-0" title="Updates automatically">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" />
              Live
            </Badge>
          ) : null}
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        <nav className="flex gap-1 border-b">
          <ReportTabLink
            to="/tournaments/report/$token"
            token={token}
            label="Rounds"
            isActive={active === "rounds"}
          />
          <ReportTabLink
            to="/tournaments/report/$token/standings"
            token={token}
            label="Standings"
            isActive={active === "standings"}
          />
        </nav>
        {render(data)}
      </div>
    </>
  );
}
