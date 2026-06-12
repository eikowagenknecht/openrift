import type {
  PodReportResponse,
  PodTournamentDetailResponse,
  PodTournamentStatus,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import {
  TopBarBreadcrumbSeparator,
  TopBarBreadcrumbTrail,
} from "@/components/layout/top-bar-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { usePodTournamentDetail, usePodTournamentReport } from "@/hooks/use-pod-tournaments";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

const STATUS_LABEL: Record<PodTournamentStatus, string> = {
  setup: "Not started",
  running: "In progress",
  completed: "Completed",
};

export type OwnerTab = "pairings" | "standings" | "players" | "settings";
export type ReportTab = "rounds" | "standings";

function tabLinkClass(isActive: boolean): string {
  return cn(
    "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium transition-colors",
    isActive
      ? "border-primary text-foreground"
      : "text-muted-foreground hover:text-foreground border-transparent",
  );
}

function OwnerTabLink({
  to,
  id,
  label,
  isActive,
}: {
  to:
    | "/tournaments/run/$id"
    | "/tournaments/run/$id/standings"
    | "/tournaments/run/$id/players"
    | "/tournaments/run/$id/settings";
  id: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      to={to}
      params={{ id }}
      aria-current={isActive ? "page" : undefined}
      className={tabLinkClass(isActive)}
    >
      {label}
    </Link>
  );
}

function ReportTabLink({
  to,
  token,
  label,
  isActive,
}: {
  to: "/tournaments/run/report/$token" | "/tournaments/run/report/$token/standings";
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
 * Owner dashboard frame: loads the tournament and wraps the active tab's content
 * in the shared header + route-based tab nav. Every owner tab mounts through this.
 * @returns The framed owner page.
 */
export function TournamentPageFrame({
  id,
  active,
  render,
}: {
  id: string;
  active: OwnerTab;
  render: (data: PodTournamentDetailResponse) => ReactNode;
}) {
  const { data } = usePodTournamentDetail(id);
  return (
    <>
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar className="gap-2">
          <TopBarBreadcrumbTrail
            segments={[{ label: "Tournaments", link: <Link to="/tournaments/run" /> }]}
          />
          <TopBarBreadcrumbSeparator className="hidden sm:inline" />
          <PageTopBarTitle>{data.tournament.name}</PageTopBarTitle>
          <Badge variant="secondary" className="shrink-0">
            {STATUS_LABEL[data.tournament.status]}
          </Badge>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", PAGE_PADDING_NO_TOP)}>
        <nav className="flex gap-1 border-b">
          <OwnerTabLink
            to="/tournaments/run/$id"
            id={id}
            label="Pairings"
            isActive={active === "pairings"}
          />
          <OwnerTabLink
            to="/tournaments/run/$id/standings"
            id={id}
            label="Standings"
            isActive={active === "standings"}
          />
          <OwnerTabLink
            to="/tournaments/run/$id/players"
            id={id}
            label="Players"
            isActive={active === "players"}
          />
          <OwnerTabLink
            to="/tournaments/run/$id/settings"
            id={id}
            label="Settings"
            isActive={active === "settings"}
          />
        </nav>
        {render(data)}
      </div>
    </>
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
  const { data } = usePodTournamentReport(token);
  return (
    <>
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar>
          <PageTopBarTitle>{data.tournamentName}</PageTopBarTitle>
          <Badge variant="secondary" className="shrink-0">
            {STATUS_LABEL[data.status]}
          </Badge>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", PAGE_PADDING_NO_TOP)}>
        <nav className="flex gap-1 border-b">
          <ReportTabLink
            to="/tournaments/run/report/$token"
            token={token}
            label="Rounds"
            isActive={active === "rounds"}
          />
          <ReportTabLink
            to="/tournaments/run/report/$token/standings"
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
