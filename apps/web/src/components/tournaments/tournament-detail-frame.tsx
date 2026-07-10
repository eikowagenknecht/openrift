import type { TournamentDetailResponse } from "@openrift/shared";
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
  TopBarBreadcrumbSeparator,
  TopBarBreadcrumbTrail,
} from "@/components/layout/top-bar-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { useTournamentDetail } from "@/hooks/use-tournaments";
import {
  canManageTournament,
  EFFECTIVE_STATE_LABEL,
  effectiveTournamentState,
} from "@/lib/tournament-display";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

export type TournamentTab =
  | "overview"
  | "participants"
  | "pairings"
  | "standings"
  | "decks"
  | "staff"
  | "settings";

export const TOURNAMENT_TABS: readonly TournamentTab[] = [
  "overview",
  "participants",
  "pairings",
  "standings",
  "decks",
  "staff",
  "settings",
];

/** A tournament section page (every tab except the overview/dashboard landing). */
export type TournamentSection = Exclude<TournamentTab, "overview">;

const TOURNAMENT_SECTION_LABEL: Record<TournamentSection, string> = {
  participants: "Participants",
  pairings: "Pairings",
  standings: "Standings",
  decks: "Decks",
  staff: "Staff",
  settings: "Settings",
};

/**
 * The shared sticky title bar for the tournament overview / dashboard landing:
 * the `Tournaments` breadcrumb, the tournament name, its effective-state badge,
 * and a Settings shortcut for organizers.
 * @returns The overview-page chrome with its dashboard content.
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
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar className="gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:items-baseline">
            <TopBarBreadcrumbTrail
              segments={[{ label: "Tournaments", link: <Link to="/tournaments" /> }]}
            />
            <TopBarBreadcrumbSeparator className="hidden sm:inline" />
            <PageTopBarTitle>{data.name}</PageTopBarTitle>
            <Badge variant="secondary" className="shrink-0">
              {
                EFFECTIVE_STATE_LABEL[
                  effectiveTournamentState(data.startsAt, data.endsAt, data.status)
                ]
              }
            </Badge>
          </div>
          {manage ? (
            <PageTopBarActions>
              <PageTopBarButton render={<Link to="/tournaments/$id/settings" params={{ id }} />}>
                <SettingsIcon className="size-4" />
                Settings
              </PageTopBarButton>
            </PageTopBarActions>
          ) : null}
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-8 pt-3", PAGE_PADDING_NO_TOP)}>
        {render(data)}
      </div>
    </>
  );
}

/**
 * The shared sticky title bar for a tournament section page: the
 * `Tournaments / {name}` breadcrumb trail (collapsing to a back arrow on
 * phones), the section title, and an optional actions slot. Replaces the old
 * tab nav — sections are reached from the dashboard tiles and the breadcrumb.
 * @returns The section-page chrome with its content.
 */
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
  // Measure the sticky bar so any sticky child below it (e.g. the settings
  // page's PageToc) offsets past the bar instead of tucking under it.
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null);
  const barHeight = useMeasuredHeight(barEl);

  return (
    <>
      <PageTopBarSticky ref={setBarEl} maxWidth="5xl">
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
        className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}
        style={
          { "--sticky-top": `calc(var(--header-height) + ${barHeight}px + 1rem)` } as CSSProperties
        }
      >
        {render(data)}
      </div>
    </>
  );
}
