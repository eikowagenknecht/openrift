import type {
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupRole,
  FriendGroupShareResponse,
} from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  SettingsIcon,
  ShieldIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/user-avatar";
import { useTradeActionCounts } from "@/hooks/use-card-trades";
import { useCollections } from "@/hooks/use-collections";
import {
  useAcceptFriendGroupInvite,
  useDeclineFriendGroupInvite,
  useFriendGroupDetail,
  useFriendGroupMatches,
  useKickFriendGroupMember,
  useTransferFriendGroupOwnership,
  useUpdateFriendGroupNickname,
  useUpdateFriendGroupRole,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { cn, PAGE_PADDING } from "@/lib/utils";

import { MatchTradeList } from "./match-row-card";
import { SharedListRow } from "./shared-list-row";
import { TradesSection } from "./trades-section";

const ROLE_LABEL: Record<FriendGroupRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const SECTION_HEADING = "text-muted-foreground text-sm font-medium tracking-wide uppercase";

type GroupTab = "trading" | "trades" | "collections" | "members";

export function isAdmin(role: FriendGroupRole | null): role is "admin" | "owner" {
  return role === "admin" || role === "owner";
}

interface FriendGroupPageProps {
  slug: string;
  tab: GroupTab;
  onTabChange: (tab: GroupTab) => void;
}

export function FriendGroupPage({ slug, tab, onTabChange }: FriendGroupPageProps) {
  const { data } = useFriendGroupDetail(slug);
  if (data.viewerStatus === "pending") {
    return <PendingApprovalStub data={data} />;
  }
  return <FriendGroupMemberView data={data} slug={slug} tab={tab} onTabChange={onTabChange} />;
}

function PendingApprovalStub({ data }: { data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const declineInvite = useDeclineFriendGroupInvite();
  const navigate = useNavigate();
  return (
    <div className={cn("mx-auto flex w-full max-w-md flex-col gap-4 text-center", PAGE_PADDING)}>
      <Heading level={1}>{data.group.name}</Heading>
      <p className="text-muted-foreground">Waiting for an admin to approve your request to join.</p>
      <Button
        variant="ghost"
        onClick={async () => {
          await declineInvite.mutateAsync({ slug: data.group.slug, userId: viewerId });
          void navigate({ to: "/groups" });
        }}
        disabled={declineInvite.isPending}
      >
        Cancel request
      </Button>
    </div>
  );
}

function FriendGroupMemberView({
  data,
  slug,
  tab,
  onTabChange,
}: {
  data: FriendGroupDetailResponse;
  slug: string;
  tab: GroupTab;
  onTabChange: (tab: GroupTab) => void;
}) {
  const { data: actionCounts } = useTradeActionCounts();
  const tradesActionCount =
    actionCounts?.byGroup.find((entry) => entry.groupId === data.group.id)?.count ?? 0;
  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", PAGE_PADDING)}>
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Heading level={1}>{data.group.name}</Heading>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{ROLE_LABEL[data.viewerRole ?? "member"]}</Badge>
            <Button
              size="sm"
              variant="ghost"
              render={<Link to="/groups/$slug/manage" params={{ slug }} />}
            >
              <SettingsIcon className="size-4" />
              Manage
            </Button>
          </div>
        </div>
        {data.group.description ? (
          <p className="text-muted-foreground">{data.group.description}</p>
        ) : null}
      </header>

      <Tabs value={tab} onValueChange={(value) => onTabChange(value as GroupTab)} className="gap-6">
        <TabsList>
          <TabsTrigger value="trading">Trading</TabsTrigger>
          <TabsTrigger value="trades">
            Trades
            {tradesActionCount > 0 ? (
              <span
                aria-label={`${tradesActionCount} need your action`}
                className="bg-primary text-primary-foreground ml-1.5 rounded-full px-1.5 text-[10px] font-medium"
              >
                {tradesActionCount > 9 ? "9+" : tradesActionCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        <TabsContent value="trading" className="flex flex-col gap-8">
          <MatchesSection slug={slug} data={data} />
          <SharedListsSection slug={slug} data={data} />
        </TabsContent>

        <TabsContent value="trades">
          <TradesSection groupId={data.group.id} />
        </TabsContent>

        <TabsContent value="collections" className="flex flex-col gap-6">
          <GroupCollectionsSection data={data} />
          <PersonalCollectionsSection data={data} />
        </TabsContent>

        <TabsContent value="members">
          <MembersSection data={data} slug={slug} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MatchesSection({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: matches } = useFriendGroupMatches(slug);
  const hasMatches =
    matches.othersHaveYourWants.length > 0 || matches.othersWantYourHaves.length > 0;

  return (
    <section className="flex flex-col gap-4">
      <h2 className={SECTION_HEADING}>Possible trades</h2>
      {hasMatches ? (
        <MatchTradeList
          incoming={matches.othersHaveYourWants}
          outgoing={matches.othersWantYourHaves}
          groupSlug={slug}
        />
      ) : (
        <MatchesEmptyState data={data} />
      )}
    </section>
  );
}

function MatchesEmptyState({ data }: { data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const viewerShares = data.shares.filter((share) => share.userId === viewerId);
  const othersShare = data.shares.some((share) => share.userId !== viewerId);

  if (!othersShare) {
    return (
      <p className="text-muted-foreground">
        No members are sharing lists with this group yet. Ask them to share a wishlist or tradelist
        to start seeing trades.
      </p>
    );
  }
  if (!viewerShares.some((share) => share.listIntent === "wish" || share.listIntent === "trade")) {
    return (
      <p className="text-muted-foreground">
        Share a wishlist or tradelist with this group from Manage to see possible trades.
      </p>
    );
  }
  return (
    <p className="text-muted-foreground">
      No matches right now. You&apos;ll see possible trades here when your wants and haves overlap
      with another member&apos;s.
    </p>
  );
}

function SharedListsSection({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  // Flat directory of the wishlists and tradelists shared with this group, one
  // row per list with the owner inlined (same shape as the trades list).
  // Joined to the roster for the owner's avatar; ordered by member, then list.
  const membersById = new Map(data.members.map((member) => [member.userId, member]));
  const rows: { member: FriendGroupMemberResponse; share: FriendGroupShareResponse }[] = [];
  for (const share of data.shares) {
    if (share.listIntent !== "wish" && share.listIntent !== "trade") {
      continue;
    }
    const member = membersById.get(share.userId);
    if (!member) {
      continue;
    }
    rows.push({ member, share });
  }
  rows.sort((a, b) => {
    const aName = a.member.userName ?? "￿";
    const bName = b.member.userName ?? "￿";
    const byMember = aName.localeCompare(bName);
    return byMember === 0 ? a.share.listName.localeCompare(b.share.listName) : byMember;
  });

  return (
    <section className="flex flex-col gap-4">
      <h2 className={SECTION_HEADING}>Shared lists</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No members have shared a wishlist or tradelist with this group yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(({ member, share }) => (
            <SharedListRow key={share.listId} slug={slug} member={member} share={share} />
          ))}
        </div>
      )}
    </section>
  );
}

function GroupCollectionsSection({ data }: { data: FriendGroupDetailResponse }) {
  const { data: collections } = useCollections();
  const [createOpen, setCreateOpen] = useState(false);
  const groupCollections = collections.filter((col) => col.groupId === data.group.id);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className={SECTION_HEADING}>Group collections</h2>
        <Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          New shared collection
        </Button>
      </div>
      {groupCollections.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No group collections yet. Any member can create one. A group collection is a pooled
          inventory the whole group can add to and remove from.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {groupCollections.map((col) => (
            <li key={col.id}>
              <Link
                to="/collections/$collectionId"
                params={{ collectionId: col.id }}
                search={(prev) => prev}
                className="hover:bg-muted/50 flex items-center gap-2 rounded-md px-3 py-2"
              >
                <BookOpenIcon className="size-4" />
                <span className="flex-1 truncate">{col.name}</span>
                {col.copyCount > 0 ? (
                  <Badge variant="ghost" className="text-2xs">
                    {col.copyCount}
                  </Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        groupSlug={data.group.slug}
        groupName={data.group.name}
      />
    </section>
  );
}

function PersonalCollectionsSection({ data }: { data: FriendGroupDetailResponse }) {
  // Join shares with the members roster to get avatar / nickname for the
  // same heading style the Matches section uses. Anonymous owners fall to
  // the end. Members with no shares don't render.
  const membersById = new Map(data.members.map((member) => [member.userId, member]));
  const byOwner = new Map<
    string,
    { member: FriendGroupMemberResponse; collections: typeof data.collectionShares }
  >();
  for (const share of data.collectionShares) {
    const member = membersById.get(share.userId);
    if (!member) {
      continue;
    }
    let bucket = byOwner.get(share.userId);
    if (!bucket) {
      bucket = { member, collections: [] };
      byOwner.set(share.userId, bucket);
    }
    bucket.collections.push(share);
  }
  const owners = [...byOwner.values()].sort((a, b) => {
    const aName = a.member.userName ?? "￿";
    const bName = b.member.userName ?? "￿";
    return aName.localeCompare(bName);
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className={SECTION_HEADING}>Personal collections</h2>
      {owners.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No members have shared a personal collection with this group yet. You can share one of
          yours from Manage.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {owners.map(({ member, collections }) => (
            <Collapsible key={member.userId}>
              <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium">
                <UserAvatar
                  image={member.userImage}
                  name={member.userName}
                  gravatarHash={member.gravatarHash}
                  size="sm"
                />
                <span>{member.userName ?? "Member"}</span>
                {member.nickname ? (
                  <span className="text-muted-foreground text-xs">{member.nickname}</span>
                ) : null}
                <span className="text-muted-foreground text-xs">({collections.length})</span>
                <ChevronDownIcon className="text-muted-foreground ml-auto size-4 shrink-0 transition-transform data-[panel-open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-1 ml-8 flex flex-col gap-1">
                  {collections.map((share) => (
                    <li key={share.collectionId}>
                      <Link
                        to="/groups/$slug/collections/$collectionId"
                        params={{ slug: data.group.slug, collectionId: share.collectionId }}
                        search={(prev) => prev}
                        className="hover:bg-muted/50 flex items-center gap-2 rounded-md px-2 py-1.5"
                      >
                        <BookOpenIcon className="size-4" />
                        <span className="flex-1 truncate">{share.collectionName}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </section>
  );
}

function MembersSection({ data, slug }: { data: FriendGroupDetailResponse; slug: string }) {
  const viewerId = useRequiredUserId();
  const viewerRole = data.viewerRole ?? "member";
  const acceptInvite = useAcceptFriendGroupInvite();
  const declineInvite = useDeclineFriendGroupInvite();

  return (
    <section className="flex flex-col gap-4">
      {isAdmin(viewerRole) && data.pendingRequests.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
          <h3 className="font-medium">Pending requests</h3>
          <div className="flex flex-col gap-2">
            {data.pendingRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UserAvatar
                    image={req.userImage}
                    name={req.userName}
                    gravatarHash={req.gravatarHash}
                    size="sm"
                    className="size-7"
                  />
                  <span className="font-medium">{req.userName ?? "Unknown user"}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => acceptInvite.mutate({ slug, userId: req.userId })}
                    disabled={acceptInvite.isPending}
                  >
                    <CheckIcon className="size-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => declineInvite.mutate({ slug, userId: req.userId })}
                    disabled={declineInvite.isPending}
                  >
                    <XIcon className="size-4" />
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {data.members.map((member) => (
          <MemberRow
            key={member.userId}
            slug={slug}
            member={member}
            viewerId={viewerId}
            viewerRole={viewerRole}
          />
        ))}
      </div>
    </section>
  );
}

function MemberRow({
  slug,
  member,
  viewerId,
  viewerRole,
}: {
  slug: string;
  member: FriendGroupMemberResponse;
  viewerId: string;
  viewerRole: FriendGroupRole;
}) {
  const isSelf = member.userId === viewerId;
  const [nickname, setNickname] = useState(member.nickname ?? "");
  const [nicknameDirty, setNicknameDirty] = useState(false);
  const updateNickname = useUpdateFriendGroupNickname();
  const updateRole = useUpdateFriendGroupRole();
  const kickMember = useKickFriendGroupMember();
  const transferOwnership = useTransferFriendGroupOwnership();

  const canKick =
    isAdmin(viewerRole) &&
    !isSelf &&
    member.role !== "owner" &&
    (member.role !== "admin" || viewerRole === "owner");
  const canPromote = isAdmin(viewerRole) && !isSelf && member.role === "member";
  const canDemote = viewerRole === "owner" && !isSelf && member.role === "admin";
  const canTransfer = viewerRole === "owner" && !isSelf && member.role !== "owner";

  return (
    <div className="bg-card hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-md border p-3 transition-colors">
      <UserAvatar
        image={member.userImage}
        name={member.userName}
        gravatarHash={member.gravatarHash}
        className="size-9"
      />
      <Link
        to="/groups/$slug/members/$userId"
        params={{ slug, userId: member.userId }}
        className="flex min-w-0 flex-1 flex-col"
      >
        <span className="truncate font-medium">{member.userName ?? "Unknown user"}</span>
        <span className="text-muted-foreground text-xs">{ROLE_LABEL[member.role]}</span>
      </Link>
      {isSelf ? (
        <div className="flex items-center gap-2">
          <Input
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setNicknameDirty(true);
            }}
            placeholder="Add a nickname / contact"
            className="w-56"
            maxLength={80}
          />
          {nicknameDirty ? (
            <Button
              size="sm"
              onClick={async () => {
                await updateNickname.mutateAsync({
                  slug,
                  userId: viewerId,
                  nickname: nickname.trim() || null,
                });
                setNicknameDirty(false);
              }}
              disabled={updateNickname.isPending}
            >
              Save
            </Button>
          ) : null}
        </div>
      ) : member.nickname ? (
        <span className="text-muted-foreground text-xs">{member.nickname}</span>
      ) : null}

      {(canKick || canPromote || canDemote || canTransfer) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="sm" variant="ghost" aria-label="Member actions" />}
          >
            <EllipsisVerticalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canPromote && (
              <DropdownMenuItem
                onClick={() => updateRole.mutate({ slug, userId: member.userId, role: "admin" })}
              >
                <ShieldIcon className="size-4" />
                Promote to admin
              </DropdownMenuItem>
            )}
            {canDemote && (
              <DropdownMenuItem
                onClick={() => updateRole.mutate({ slug, userId: member.userId, role: "member" })}
              >
                Demote to member
              </DropdownMenuItem>
            )}
            {canTransfer && (
              <DropdownMenuItem
                onClick={() => transferOwnership.mutate({ slug, userId: member.userId })}
              >
                Transfer ownership
              </DropdownMenuItem>
            )}
            {canKick && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => kickMember.mutate({ slug, userId: member.userId })}
                  className="text-destructive"
                >
                  <Trash2Icon className="size-4" />
                  Remove
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
