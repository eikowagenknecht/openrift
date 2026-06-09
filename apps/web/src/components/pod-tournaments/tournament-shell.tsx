import type {
  PodReportResponse,
  PodTournamentDetailResponse,
  PodTournamentStatus,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { usePodTournamentDetail, usePodTournamentReport } from "@/hooks/use-pod-tournaments";
import { cn, PAGE_PADDING } from "@/lib/utils";

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
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", PAGE_PADDING)}>
      <div className="flex flex-col gap-2">
        <Link
          to="/tournaments/run"
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="size-4" /> All tournaments
        </Link>
        <header className="flex flex-wrap items-center gap-3">
          <Heading level={1}>{data.tournament.name}</Heading>
          <Badge variant="secondary">{STATUS_LABEL[data.tournament.status]}</Badge>
        </header>
      </div>
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
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", PAGE_PADDING)}>
      <header className="flex flex-wrap items-center gap-3">
        <Heading level={1}>{data.tournamentName}</Heading>
        <Badge variant="secondary">{STATUS_LABEL[data.status]}</Badge>
      </header>
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
  );
}
