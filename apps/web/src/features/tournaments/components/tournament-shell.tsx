import type {
  PodReportResponse,
  PodTournamentStatus,
} from "@openrift/shared/types/api/pod-tournament";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { useTournamentReport } from "@/features/tournaments/hooks/use-tournaments";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

const STATUS_LABEL: Record<PodTournamentStatus, string> = {
  setup: "Not started",
  running: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
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
  const live = data.rounds.some((round) => round.status === "reporting");
  return (
    <>
      <PageTopBarSticky width="capped">
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
      <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
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
