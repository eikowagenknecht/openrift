import { Link } from "@tanstack/react-router";
import { PlusIcon, TrophyIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { TournamentsOverview } from "@/components/tournaments/tournaments-overview";
import { buttonVariants } from "@/components/ui/button";
import { useGroupTournaments } from "@/hooks/use-tournaments";

interface GroupTournamentsLensProps {
  slug: string;
  canCreate: boolean;
  /** The group's id, for pre-filling the create wizard from the empty state. */
  groupId: string;
}

/**
 * The group's tournaments lens (ADR-033): every tournament associated with this
 * friend group, each linking to the unified tournament surface. The next (or
 * live) event gets a hero tile with a card-art band; completed and cancelled
 * events read as the group's history down a timeline, with winner callouts.
 * Group admins get a "New tournament" shortcut (in the page top bar) that
 * pre-fills the group.
 * @returns The lens content.
 */
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
