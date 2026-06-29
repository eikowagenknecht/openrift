import type { TournamentSummaryResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { TournamentCard } from "@/components/tournaments/tournaments-list-page";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useGroupTournaments } from "@/hooks/use-tournaments";
import { compareTournamentsForList, partitionTournaments } from "@/lib/tournament-display";
import { cn } from "@/lib/utils";

/**
 * The group's tournaments lens (ADR-033): every tournament associated with this
 * friend group, each linking to the unified tournament surface. Replaces the
 * legacy group deck-check "events" page. Completed and cancelled tournaments are
 * tucked into a collapsible "Past and archived" section below the live ones.
 * Group admins get a "New tournament" shortcut that pre-fills the group.
 * @returns The lens content.
 */
export function GroupTournamentsLens({
  slug,
  groupId,
  canCreate,
}: {
  slug: string;
  /** The group's uuid — handed to the create route, which links by id (not slug). */
  groupId: string;
  canCreate: boolean;
}) {
  const { data } = useGroupTournaments(slug);
  const { current, pastOrArchived } = partitionTournaments(data.items);
  const currentSorted = current.toSorted((a, b) => compareTournamentsForList(a, b));
  const pastSorted = pastOrArchived.toSorted((a, b) => compareTournamentsForList(a, b));

  return (
    <div className="flex flex-col gap-4">
      {canCreate ? (
        <div className="flex justify-end">
          <Button size="sm" render={<Link to="/tournaments/new" search={{ group: groupId }} />}>
            <PlusIcon className="size-4" />
            New tournament
          </Button>
        </div>
      ) : null}

      {data.items.length === 0 ? (
        <p className="text-muted-foreground">
          No tournaments for this group yet.
          {canCreate ? " Create one to run pods, deck submission, and deck check together." : ""}
        </p>
      ) : (
        <>
          {currentSorted.length === 0 ? (
            <p className="text-muted-foreground">No upcoming tournaments.</p>
          ) : (
            <TournamentGrid tournaments={currentSorted} />
          )}
          {pastSorted.length > 0 ? <PastAndArchived tournaments={pastSorted} /> : null}
        </>
      )}
    </div>
  );
}

function TournamentGrid({ tournaments }: { tournaments: TournamentSummaryResponse[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {tournaments.map((tournament) => (
        <li key={tournament.id}>
          <TournamentCard tournament={tournament} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Completed and cancelled tournaments tucked into a collapsible section so the
 * lens leads with what's live. Collapsed by default; the count stays visible on
 * the trigger.
 * @returns The collapsible past-and-archived section.
 */
function PastAndArchived({ tournaments }: { tournaments: TournamentSummaryResponse[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-1.5 text-sm font-medium transition-colors">
        <ChevronDownIcon
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
        Past and archived ({tournaments.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2">
          <TournamentGrid tournaments={tournaments} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
