import { Link } from "@tanstack/react-router";
import { PlusIcon, TrophyIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { TournamentsOverview } from "@/features/tournaments/components/tournaments-overview";
import { useGroupTournaments } from "@/features/tournaments/hooks/use-tournaments";

interface GroupTournamentsLensProps {
  slug: string;
  canCreate: boolean;
  groupId: string;
}

export function GroupTournamentsLens({ slug, canCreate, groupId }: GroupTournamentsLensProps) {
  const { data } = useGroupTournaments(slug);

  if (data.items.length === 0) {
    return (
      <EmptyState
        className="py-12"
        icon={TrophyIcon}
        title="No tournaments yet"
        description="Your group's event history."
      >
        {canCreate ? (
          <Link
            to="/tournaments/new"
            search={{ group: groupId }}
            className={buttonVariants({ variant: "default" })}
          >
            <PlusIcon />
            New tournament
          </Link>
        ) : null}
      </EmptyState>
    );
  }

  return (
    <TournamentsOverview
      tournaments={data.items}
      noUpcomingText={
        canCreate
          ? "No upcoming tournaments. Create one to get the next event on the calendar."
          : "No upcoming tournaments."
      }
    />
  );
}
