import type { FriendGroupDetailResponse } from "@openrift/shared";
import { capitalize, formatDayTimeLocal } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, FolderIcon, HeartIcon, TrophyIcon, UsersIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { CardList } from "@/components/ui/card-list";
import { IconChip } from "@/components/ui/icon-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import type { StatTileTone } from "@/components/ui/stat-tile";
import { StatTile } from "@/components/ui/stat-tile";
import { UserAvatarStack } from "@/components/user-avatar-stack";
import { useCollections } from "@/hooks/use-collections";
import { useGroupBoxWants } from "@/hooks/use-friend-groups";
import { useGroupTournaments } from "@/hooks/use-tournaments";
import { useRequiredUserId } from "@/lib/auth-session";
import { compareTournamentsForList, partitionTournaments } from "@/lib/tournament-display";
import { cn } from "@/lib/utils";

import { FriendGroupActivityFeed } from "./friend-group-activity-feed";
import { isAdmin } from "./friend-group-shell";
import { GroupSetupNudges } from "./group-setup-nudges";
import { HOVER_ROW_CLASS } from "./hover-row";
import { LIST_INTENT_ICON, LIST_INTENT_NOUN } from "./list-intent-meta";
import { PendingRequestsBand } from "./pending-requests-band";
import { TradesHubBand } from "./trades-hub-band";

export function OverviewContent({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  return (
    <div className="flex flex-col gap-8">
      {isAdmin(data.viewerRole) && data.pendingRequests.length > 0 ? (
        <PendingRequestsBand slug={slug} requests={data.pendingRequests} />
      ) : null}
      <GroupSetupNudges slug={slug} data={data} />
      <TradesHubBand slug={slug} data={data} />
      <ActionTiles slug={slug} data={data} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <FriendGroupActivityFeed slug={slug} />
        <OverviewRail slug={slug} data={data} />
      </div>
    </div>
  );
}

function ActionTiles({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const { data: collections } = useCollections();

  const groupCollections = collections.filter((col) => col.groupId === data.group.id);
  const memberShareCount = data.collectionShares.filter(
    (share) => share.userId !== viewerId,
  ).length;

  const boxWants = useGroupBoxWants(groupCollections.length > 0 ? slug : undefined);

  const bestBoxId = boxWants.bestCollection(groupCollections.map((box) => box.id));
  const wantedBox = groupCollections.find((col) => col.id === bestBoxId);
  const boxesWithWants = groupCollections.filter(
    (col) => boxWants.wantedCardCount(col.id) > 0,
  ).length;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        wantedBox ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3",
      )}
    >
      {wantedBox ? (
        <StatTile
          render={
            <Link
              to="/collections/$collectionId"
              params={{ collectionId: wantedBox.id }}
              search={{ wanted: true }}
            />
          }
          icon={HeartIcon}
          tone="gold"
          label="Cards you want"
          value={boxWants.wantedCardCount()}
          hint={
            boxesWithWants > 1
              ? `across ${boxesWithWants} group boxes`
              : `waiting in ${wantedBox.name}`
          }
        />
      ) : null}
      <GroupTournamentsTile slug={slug} data={data} />
      <StatCard
        to="/groups/$slug/shared"
        slug={slug}
        icon={FolderIcon}
        tone="info"
        label="Group collections"
        value={groupCollections.length}
        hint={
          memberShareCount > 0 ? `+${memberShareCount} shared by members` : "owned by the group"
        }
      />
      <MembersCard slug={slug} data={data} />
    </div>
  );
}

// The group-tournaments list is member-scoped server-side, so the query is safe for any role.
function GroupTournamentsTile({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: tournaments } = useGroupTournaments(slug);
  // Uses the same "current" bucket as the events page so the two never disagree.
  const open = partitionTournaments(tournaments.items).current;
  const joined = open.filter((tournament) => tournament.myRoles.includes("participant")).length;

  if (open.length === 0) {
    return (
      <StatCard
        to="/groups/$slug/events"
        slug={slug}
        icon={TrophyIcon}
        tone="violet"
        label="Tournaments"
        value="None open"
        valueClassName="text-muted-foreground truncate text-lg"
        hint={
          isAdmin(data.viewerRole)
            ? "Plan one for the next game night →"
            : tournaments.items.length === 0
              ? "no tournaments yet"
              : `${tournaments.items.length} total`
        }
      />
    );
  }
  return (
    <StatCard
      to="/groups/$slug/events"
      slug={slug}
      icon={TrophyIcon}
      tone="violet"
      label="Open tournaments"
      value={open.length}
      hint={joined > 0 ? `you're in ${joined}` : `${tournaments.items.length} total`}
    />
  );
}

type StatCardTarget =
  | "/groups/$slug/trades"
  | "/groups/$slug/shared"
  | "/groups/$slug/members"
  | "/groups/$slug/events";

function StatCard({
  to,
  slug,
  ...props
}: {
  to: StatCardTarget;
  slug: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  accent?: boolean;
  tone?: StatTileTone;
  hint?: ReactNode;
  children?: ReactNode;
}): ReactNode {
  return <StatTile render={<Link to={to} params={{ slug }} />} {...props} />;
}

function MembersCard({ slug, data }: { slug: string; data: FriendGroupDetailResponse }): ReactNode {
  const shown = data.members.slice(0, 5);
  return (
    <StatCard
      to="/groups/$slug/members"
      slug={slug}
      icon={UsersIcon}
      tone="success"
      label="Members"
      value={data.members.length}
    >
      <UserAvatarStack members={shown} totalCount={data.members.length} size="sm" />
    </StatCard>
  );
}

function OverviewRail({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  return (
    <aside className="flex flex-col gap-8">
      <NewestShared slug={slug} data={data} />
      <TournamentNudge slug={slug} data={data} />
    </aside>
  );
}

type SharedRow = {
  key: string;
  sharedAt: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  sub: string;
} & ({ target: "list"; listId: string } | { target: "collection"; collectionId: string });

function RailRowBody({ row }: { row: SharedRow }) {
  return (
    <>
      <IconChip icon={row.icon} size="sm" shape="round" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{row.name}</span>
        <span className="text-muted-foreground truncate text-xs">{row.sub}</span>
      </span>
    </>
  );
}

function NewestShared({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const rows: SharedRow[] = [
    ...data.shares.map((share): SharedRow => ({
      key: `list:${share.listId}`,
      sharedAt: share.sharedAt,
      icon: LIST_INTENT_ICON[share.listIntent],
      name: share.listName,
      sub: `${capitalize(LIST_INTENT_NOUN[share.listIntent])} · ${share.userName ?? "a member"}`,
      target: "list",
      listId: share.listId,
    })),
    ...data.collectionShares.map((share): SharedRow => ({
      key: `collection:${share.collectionId}`,
      sharedAt: share.sharedAt,
      icon: FolderIcon,
      name: share.collectionName,
      sub: `Collection · ${share.userName ?? "a member"}`,
      target: "collection",
      collectionId: share.collectionId,
    })),
  ]
    .toSorted((a, b) => b.sharedAt.localeCompare(a.sharedAt))
    .slice(0, 3);

  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Newest shared</SectionHeading>
      <CardList>
        {rows.map((row) => (
          <li key={row.key}>
            {/* Each branch renders its own concrete <Link> so `to`/`params` stay correlated. */}
            {row.target === "list" ? (
              <Link
                to="/groups/$slug/lists/$listId"
                params={{ slug, listId: row.listId }}
                className={HOVER_ROW_CLASS}
              >
                <RailRowBody row={row} />
              </Link>
            ) : (
              <Link
                to="/groups/$slug/collections/$collectionId"
                params={{ slug, collectionId: row.collectionId }}
                className={HOVER_ROW_CLASS}
              >
                <RailRowBody row={row} />
              </Link>
            )}
          </li>
        ))}
      </CardList>
    </section>
  );
}

function TournamentNudge({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: tournaments } = useGroupTournaments(slug);
  const current = partitionTournaments(tournaments.items)
    .current.toSorted((a, b) => compareTournamentsForList(a, b))
    .slice(0, 2);
  const admin = isAdmin(data.viewerRole);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Next up</SectionHeading>
      {current.length > 0 ? (
        <CardList>
          {current.map((tournament) => (
            <li key={tournament.id}>
              <Link
                to="/tournaments/$id"
                params={{ id: tournament.id }}
                className={HOVER_ROW_CLASS}
              >
                <IconChip icon={TrophyIcon} tone="violet" size="sm" shape="round" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{tournament.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {formatDayTimeLocal(tournament.startsAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </CardList>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
          <p className="text-muted-foreground text-sm">
            {admin
              ? "No tournaments planned. Set one up for the next game night."
              : "No tournaments planned yet. When an admin sets one up, it will show up here."}
          </p>
          {admin ? (
            <Link
              to="/groups/$slug/events"
              params={{ slug }}
              className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              Plan a tournament
              <ChevronRightIcon className="size-4" />
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
