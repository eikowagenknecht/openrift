import type { TournamentDetailResponse } from "@openrift/shared/types/api/tournament";
import { Link } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarSticky,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import {
  TopBarBreadcrumbBar,
  TopBarBreadcrumbSeparator,
  TopBarBreadcrumbTrail,
} from "@/components/layout/top-bar-breadcrumb";
import { TournamentHero } from "@/features/tournaments/components/tournament-hero";
import { useTournamentDetail } from "@/features/tournaments/hooks/use-tournaments";
import { canManageTournament } from "@/features/tournaments/lib/tournament-display";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

type TournamentTab =
  | "overview"
  | "participants"
  | "pairings"
  | "standings"
  | "decks"
  | "my-deck"
  | "staff"
  | "settings";

export type TournamentSection = Exclude<TournamentTab, "overview">;

const TOURNAMENT_SECTION_LABEL: Record<TournamentSection, string> = {
  participants: "Participants",
  pairings: "Pairings",
  standings: "Standings",
  // "Decks" is the judging queue (every entrant); "My deck" is the player's own.
  decks: "Decks",
  "my-deck": "My deck",
  staff: "Staff",
  settings: "Settings",
};

/**
 * The overview has no title in its bar: the hero below is the title row, so
 * the bar keeps only the breadcrumb trail and the organizers' Settings shortcut.
 */
export function TournamentOverviewFrame({
  id,
  render,
}: {
  id: string;
  render: (data: TournamentDetailResponse) => ReactNode;
}) {
  const { data } = useTournamentDetail(id);
  const manage = canManageTournament(data.myRoles);

  return (
    <>
      <TopBarBreadcrumbBar
        segments={[
          { label: "Tournaments", link: <Link to="/tournaments" /> },
          { label: data.name },
        ]}
        actions={
          manage ? (
            <PageTopBarButton render={<Link to="/tournaments/$id/settings" params={{ id }} />}>
              <SettingsIcon className="size-4" />
              Settings
            </PageTopBarButton>
          ) : undefined
        }
      />
      <TournamentHero detail={data} />
      <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-8 pt-6", PAGE_PADDING_NO_TOP)}>
        {render(data)}
      </div>
    </>
  );
}

export function TournamentSectionFrame({
  id,
  section,
  actions,
  render,
}: {
  id: string;
  section: TournamentSection;
  actions?: ReactNode;
  render: (data: TournamentDetailResponse) => ReactNode;
}) {
  const { data } = useTournamentDetail(id);
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null);
  const barHeight = useMeasuredHeight(barEl);

  return (
    <>
      <PageTopBarSticky ref={setBarEl} width="capped">
        <PageTopBar className="gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:items-baseline">
            <TopBarBreadcrumbTrail
              segments={[
                { label: "Tournaments", link: <Link to="/tournaments" /> },
                { label: data.name, link: <Link to="/tournaments/$id" params={{ id }} /> },
              ]}
            />
            <TopBarBreadcrumbSeparator className="hidden sm:inline" />
            <PageTopBarTitle>{TOURNAMENT_SECTION_LABEL[section]}</PageTopBarTitle>
          </div>
          {actions ? <PageTopBarActions>{actions}</PageTopBarActions> : null}
        </PageTopBar>
      </PageTopBarSticky>
      <div
        className={cn(PAGE_WIDTH.capped, "flex flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}
        style={
          { "--sticky-top": `calc(var(--header-height) + ${barHeight}px + 1rem)` } as CSSProperties
        }
      >
        {render(data)}
      </div>
    </>
  );
}
