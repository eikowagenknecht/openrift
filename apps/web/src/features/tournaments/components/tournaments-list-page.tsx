import { Link } from "@tanstack/react-router";
import { PlusIcon, TrophyIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import {
  PageDescription,
  PageTopBar,
  PageTopBarActions,
  PageTopBarPrimaryButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { buttonVariants } from "@/components/ui/button";
import { TournamentsOverview } from "@/features/tournaments/components/tournaments-overview";
import { useTournaments } from "@/features/tournaments/hooks/use-tournaments";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

export function TournamentsListPage() {
  const { data } = useTournaments();

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Tournaments</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarPrimaryButton render={<Link to="/tournaments/new" />}>
              <PlusIcon /> New tournament
            </PageTopBarPrimaryButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        <PageDescription>Tournaments you host, judge, or joined.</PageDescription>

        {data.items.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={TrophyIcon}
            title="No tournaments yet"
            description="Create a tournament, or join one through its registration link."
          >
            <Link to="/tournaments/new" className={buttonVariants({ variant: "default" })}>
              <PlusIcon />
              New tournament
            </Link>
          </EmptyState>
        ) : (
          <TournamentsOverview
            tournaments={data.items}
            noUpcomingText="No upcoming tournaments. Create one, or join an event through its registration link."
            showContext
          />
        )}
      </div>
    </>
  );
}
