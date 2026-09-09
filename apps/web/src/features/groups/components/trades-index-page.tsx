import { Link } from "@tanstack/react-router";
import { BellIcon, CheckIcon, ChevronRightIcon, HandshakeIcon, SparklesIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { CardLink } from "@/components/ui/card-link";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { IconChip } from "@/components/ui/icon-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { CardArtThumbStack } from "@/features/cards/components/card-art-thumb-stack";
import { useCards } from "@/features/cards/hooks/use-cards";
import { frontImageId } from "@/features/cards/lib/card-meta";
import { useUserTrades } from "@/features/groups/hooks/use-card-trades";
import {
  useFriendGroupMatchPanels,
  useFriendGroupsList,
} from "@/features/groups/hooks/use-friend-groups";
import { distinctPrintingIds } from "@/features/groups/lib/friend-group-activity";
import { needsYouLine, possibleTradesLine } from "@/features/groups/lib/trade-hub";
import type { TradesIndexMatchGroup, TradesIndexPerson } from "@/features/groups/lib/trades-index";
import { buildTradesIndex } from "@/features/groups/lib/trades-index";
import { cn, PAGE_WIDTH } from "@/lib/utils";

function artPrintingIds(person: TradesIndexPerson): string[] {
  if (person.needsYou.length > 0) {
    return distinctPrintingIds(person.needsYou);
  }
  if (person.waiting.length > 0) {
    return distinctPrintingIds(person.waiting);
  }
  return person.suggestionPrintingIds;
}

function PersonCard({ person, showGroups }: { person: TradesIndexPerson; showGroups: boolean }) {
  const { printingsById } = useCards();
  const action = needsYouLine(person.needsYou);
  const art = artPrintingIds(person).map((printingId) => ({
    key: printingId,
    imageId: frontImageId(printingsById[printingId]),
  }));
  const waiting = person.needsYou.length > 0 ? 0 : person.waiting.length;

  return (
    <CardLink
      render={
        <Link
          to="/trades/$userId"
          params={{ userId: person.userId }}
          search={{ from: undefined }}
        />
      }
      className="gap-1.5 p-4"
    >
      <div className="flex items-center gap-2.5">
        <UserAvatar
          image={person.image}
          name={person.name}
          gravatarHash={person.gravatarHash}
          size="sm"
        />
        <span className="min-w-0 flex-1 truncate font-medium">{person.name ?? "Member"}</span>
        <ChevronRightIcon className="text-muted-foreground/40 group-hover/card:text-muted-foreground size-4 shrink-0 transition-transform group-hover/card:translate-x-0.5" />
      </div>
      {showGroups ? (
        <p className="text-muted-foreground truncate text-xs">{person.groupNames.join(" · ")}</p>
      ) : null}
      {action === null ? null : <p className="text-warning text-sm font-medium">{action}</p>}
      {art.length > 0 ? <CardArtThumbStack items={art} max={5} thumbClassName="w-8" /> : null}
      {person.suggestions > 0 ? (
        <p className="text-success flex items-center gap-1 text-sm font-medium">
          <SparklesIcon className="size-3.5 shrink-0" />
          {possibleTradesLine(person.suggestions)}
        </p>
      ) : null}
      {waiting > 0 ? (
        <p className="text-muted-foreground text-sm">{waiting} waiting on them</p>
      ) : null}
      {person.doneCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          {person.doneCount} {person.doneCount === 1 ? "trade" : "trades"} done
        </p>
      ) : null}
    </CardLink>
  );
}

function PeopleGrid({ people, showGroups }: { people: TradesIndexPerson[]; showGroups: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {people.map((person) => (
        <PersonCard key={person.userId} person={person} showGroups={showGroups} />
      ))}
    </div>
  );
}

function useTradesIndexMatchGroups(): { groups: TradesIndexMatchGroup[]; pending: boolean } {
  // Matching is expensive; it's queried per group here, so the trade sections
  // paint first and each group's possibilities arrive when it answers.
  const { data } = useFriendGroupsList(true);
  const groupsBySlug = new Map((data?.items ?? []).map((group) => [group.slug, group]));
  const panels = useFriendGroupMatchPanels([...groupsBySlug.keys()]);
  const groups = panels.flatMap((panel) => {
    const group = groupsBySlug.get(panel.slug);
    return group === undefined
      ? []
      : [
          {
            groupId: group.id,
            groupName: group.name,
            incoming: panel.incoming,
            outgoing: panel.outgoing,
          },
        ];
  });
  return { groups, pending: data === undefined || panels.length < groupsBySlug.size };
}

export function TradesIndexPage() {
  const { data } = useUserTrades();
  const matches = useTradesIndexMatchGroups();
  const index = buildTradesIndex(data?.items ?? [], matches.groups);
  const showGroups = index.groupCount > 1;
  const live = index.yourMove.length + index.waiting.length + index.couldTrade.length;
  // Held back until the matches land, so someone who has only possibilities
  // never sees the empty state flash first.
  const empty = data !== undefined && !matches.pending && live + index.past.length === 0;

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Trades</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "px-safe flex flex-col gap-6 pt-3 pb-12")}>
        <PageDescription>
          Who you&apos;re trading with and who you could trade with, across all your groups.
        </PageDescription>

        {empty ? (
          <EmptyState
            icon={HandshakeIcon}
            title="No trades yet"
            description="Trades start in a group: share a wishlist or tradelist there and matches with other members show up."
          >
            <Button render={<Link to="/groups" />}>Go to groups</Button>
          </EmptyState>
        ) : null}

        {index.yourMove.length > 0 ? (
          <section className="flex flex-col gap-3">
            <SectionHeading icon={BellIcon} tone="gold" count={index.yourMove.length}>
              Your move
            </SectionHeading>
            <PeopleGrid people={index.yourMove} showGroups={showGroups} />
          </section>
        ) : null}

        {index.waiting.length > 0 ? (
          <section className="flex flex-col gap-3">
            <SectionHeading count={index.waiting.length}>Waiting on them</SectionHeading>
            <PeopleGrid people={index.waiting} showGroups={showGroups} />
          </section>
        ) : null}

        {index.couldTrade.length > 0 ? (
          <section className="flex flex-col gap-3">
            <SectionHeading icon={SparklesIcon} tone="success" count={index.couldTrade.length}>
              Could trade
            </SectionHeading>
            <PeopleGrid people={index.couldTrade} showGroups={showGroups} />
          </section>
        ) : null}

        {index.past.length > 0 ? (
          <Collapsible defaultOpen={live === 0} className="flex flex-col gap-3">
            <SectionHeading as="h3">
              <CollapsibleTrigger className="group hover:text-foreground flex w-full items-center gap-2.5 text-left transition-colors">
                <IconChip icon={CheckIcon} size="sm" />
                Traded before with {index.past.length}{" "}
                {index.past.length === 1 ? "person" : "people"}
                <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
              </CollapsibleTrigger>
            </SectionHeading>
            <CollapsibleContent>
              <PeopleGrid people={index.past} showGroups={showGroups} />
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </>
  );
}
