import { formatMonth } from "@openrift/shared/format-date";
import type {
  FriendGroupCollectionShareResponse,
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupRole,
  FriendGroupShareResponse,
} from "@openrift/shared/types/api/friend-group";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  EllipsisVerticalIcon,
  FolderIcon,
  ShieldIcon,
  Trash2Icon,
  UserPlusIcon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SearchInput } from "@/components/filters/search-input";
import { PageTopBarButton, PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountPill } from "@/components/ui/count-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pressable } from "@/components/ui/pressable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
  useFriendGroupDetail,
  useKickFriendGroupMember,
  useUpdateFriendGroupRole,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { getSiteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";

import { ContactMethodChips } from "./contact-method-chips";
import { isAdmin, ROLE_LABEL } from "./friend-group-shell";
import { LIST_INTENT_ICON } from "./list-intent-meta";
import { PendingRequestsBand } from "./pending-requests-band";
import { ShareListsWithGroupDialog } from "./share-lists-with-group-dialog";

export type MemberSortKey = "recent" | "name" | "traded";

const MEMBER_SORT_OPTIONS: { value: MemberSortKey; label: string }[] = [
  { value: "traded", label: "Most traded with you" },
  { value: "recent", label: "Recently joined" },
  { value: "name", label: "Name" },
];

export interface MemberShareVolume {
  offered: number;
  wanted: number;
  collections: number;
}

function emptyVolume(): MemberShareVolume {
  return { offered: 0, wanted: 0, collections: 0 };
}

// Organize lists carry no trading meaning, so they are left out.
export function memberShareVolumes(
  shares: FriendGroupShareResponse[],
  collectionShares: FriendGroupCollectionShareResponse[],
): Map<string, MemberShareVolume> {
  const volumes = new Map<string, MemberShareVolume>();
  for (const share of shares) {
    if (share.listIntent === "organize") {
      continue;
    }
    const volume = volumes.get(share.userId) ?? emptyVolume();
    if (share.listIntent === "trade") {
      volume.offered += share.entryCount;
    } else {
      volume.wanted += share.entryCount;
    }
    volumes.set(share.userId, volume);
  }
  for (const share of collectionShares) {
    const volume = volumes.get(share.userId) ?? emptyVolume();
    volume.collections += 1;
    volumes.set(share.userId, volume);
  }
  return volumes;
}

export function filterMembersByName(
  members: FriendGroupMemberResponse[],
  query: string,
): FriendGroupMemberResponse[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return members;
  }
  return members.filter((member) => (member.userName ?? "").toLowerCase().includes(needle));
}

// Nameless members sort last; the rest compare by the viewer's locale.
function compareNames(a: FriendGroupMemberResponse, b: FriendGroupMemberResponse): number {
  if (a.userName === null || b.userName === null) {
    return a.userName === b.userName ? 0 : a.userName === null ? 1 : -1;
  }
  return a.userName.localeCompare(b.userName);
}

export function sortMembers(
  members: FriendGroupMemberResponse[],
  sort: MemberSortKey,
  cardsTradedByMember: Record<string, number>,
): FriendGroupMemberResponse[] {
  if (sort === "name") {
    return members.toSorted(compareNames);
  }
  if (sort === "traded") {
    return members.toSorted((a, b) => {
      const byTraded = (cardsTradedByMember[b.userId] ?? 0) - (cardsTradedByMember[a.userId] ?? 0);
      return byTraded === 0 ? compareNames(a, b) : byTraded;
    });
  }
  return members.toSorted((a, b) => Date.parse(b.joinedAt) - Date.parse(a.joinedAt));
}

export function MembersPageContent({
  slug,
  data,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
}) {
  const viewerId = useRequiredUserId();
  const viewerRole = data.viewerRole ?? "member";
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MemberSortKey>("traded");

  const volumes = memberShareVolumes(data.shares, data.collectionShares);
  const rows = sortMembers(
    filterMembersByName(data.members, query),
    sort,
    data.cardsTradedByMember,
  );

  return (
    <div className="flex flex-col gap-4">
      {isAdmin(viewerRole) && data.pendingRequests.length > 0 ? (
        <PendingRequestsBand slug={slug} requests={data.pendingRequests} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search members…"
          ariaLabel="Search members"
          className="w-full max-w-xs"
        />
        <Select
          items={MEMBER_SORT_OPTIONS}
          value={sort}
          onValueChange={(next: MemberSortKey | null) => setSort(next ?? "traded")}
        >
          <SelectTrigger className="w-52" aria-label="Sort members">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMBER_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">No members match your search.</p>
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-border divide-y">
            {rows.map((member) => (
              <MemberRow
                key={member.userId}
                slug={slug}
                groupName={data.group.name}
                member={member}
                viewerId={viewerId}
                viewerRole={viewerRole}
                volume={volumes.get(member.userId) ?? emptyVolume()}
                cardsTraded={data.cardsTradedByMember[member.userId] ?? 0}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export function MembersTradedAction({ slug }: { slug: string }) {
  const { data } = useFriendGroupDetail(slug);
  if (data.cardsTradedCount === 0) {
    return null;
  }
  return (
    <PageTopBarButton render={<Link to="/groups/$slug/trades" params={{ slug }} />}>
      <ZapIcon className="size-4" />
      {data.cardsTradedCount} cards traded
    </PageTopBarButton>
  );
}

export function MembersInviteAction({ slug }: { slug: string }) {
  const { data } = useFriendGroupDetail(slug);
  const navigate = useNavigate();
  const { copy } = useCopyToClipboard();
  if (!isAdmin(data.viewerRole ?? "member")) {
    return null;
  }
  const code = data.group.code;
  if (code === null) {
    return (
      <PageTopBarPrimaryButton render={<Link to="/groups/$slug/manage" params={{ slug }} />}>
        <UserPlusIcon className="size-4" />
        Invite
      </PageTopBarPrimaryButton>
    );
  }
  const handleInvite = async () => {
    const joinUrl = `${getSiteUrl()}/groups/join?code=${encodeURIComponent(code)}`;
    if (await copy(joinUrl)) {
      toast.success("Invite link copied. Send it to whoever you want to join");
    } else {
      void navigate({ to: "/groups/$slug/manage", params: { slug } });
    }
  };

  return (
    <PageTopBarPrimaryButton onClick={() => void handleInvite()}>
      <UserPlusIcon className="size-4" />
      Invite
    </PageTopBarPrimaryButton>
  );
}

const ROLE_BADGE_VARIANT = { owner: "warning", admin: "violet" } as const;

const ROLE_AVATAR_RING = {
  owner: "ring-border-accent/70 ring-2 ring-offset-2 ring-offset-card",
  admin: "ring-violet/60 ring-2 ring-offset-2 ring-offset-card",
  member: "",
} as const;

const NEW_MEMBER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function isNewMember(joinedAt: string): boolean {
  return Date.now() - Date.parse(joinedAt) < NEW_MEMBER_WINDOW_MS;
}

function SelfShareNudge({ slug, groupName }: { slug: string; groupName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        className="text-primary relative text-sm font-medium hover:underline"
        onClick={() => setOpen(true)}
      >
        Share a tradelist so others can find matches with you
      </Pressable>
      <ShareListsWithGroupDialog
        slug={slug}
        groupName={groupName}
        open={open}
        onOpenChange={setOpen}
        cancelLabel="Cancel"
        preselectAll={false}
      />
    </>
  );
}

function MemberRow({
  slug,
  groupName,
  member,
  viewerId,
  viewerRole,
  volume,
  cardsTraded,
}: {
  slug: string;
  groupName: string;
  member: FriendGroupMemberResponse;
  viewerId: string;
  viewerRole: FriendGroupRole;
  volume: MemberShareVolume;
  cardsTraded: number;
}) {
  const isSelf = member.userId === viewerId;
  const updateRole = useUpdateFriendGroupRole();
  const kickMember = useKickFriendGroupMember();

  const volumePills = [
    { key: "offered", icon: LIST_INTENT_ICON.trade, count: volume.offered, noun: "offered" },
    { key: "wanted", icon: LIST_INTENT_ICON.wish, count: volume.wanted, noun: "wanted" },
    {
      key: "collections",
      icon: FolderIcon,
      count: volume.collections,
      noun: volume.collections === 1 ? "collection" : "collections",
    },
  ].filter((pill) => pill.count > 0);

  const canKick =
    isAdmin(viewerRole) &&
    !isSelf &&
    member.role !== "owner" &&
    (member.role !== "admin" || viewerRole === "owner");
  const canPromote = viewerRole === "owner" && !isSelf && member.role !== "admin";
  const canDemote = viewerRole === "owner" && !isSelf && member.role === "admin";

  return (
    // The identity link stretches over the row via the ::before overlay (the
    // shared-list-row pattern); secondary controls sit above it via `relative`.
    <li className="hover:bg-muted/50 relative flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors">
      <Link
        to="/groups/$slug/members/$userId"
        params={{ slug, userId: member.userId }}
        className="flex min-w-0 flex-1 basis-56 items-center gap-3 before:absolute before:inset-0 before:content-['']"
      >
        <UserAvatar
          image={member.userImage}
          name={member.userName}
          gravatarHash={member.gravatarHash}
          className={cn("shrink-0", ROLE_AVATAR_RING[member.role])}
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium break-words">{member.userName ?? "Unknown user"}</span>
            {member.role === "member" ? null : (
              <Badge variant={ROLE_BADGE_VARIANT[member.role]}>{ROLE_LABEL[member.role]}</Badge>
            )}
            {isSelf ? <Badge variant="muted">You</Badge> : null}
            {isNewMember(member.joinedAt) ? <Badge variant="success">New</Badge> : null}
          </span>
          <span className="text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
            <span>Joined {formatMonth(member.joinedAt)}</span>
            {cardsTraded > 0 ? (
              <span className="text-warning flex items-center gap-1 font-medium">
                <ZapIcon className="size-3" />
                {cardsTraded} traded with you
              </span>
            ) : null}
          </span>
        </span>
      </Link>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {volumePills.length > 0 ? (
          volumePills.map((pill) => (
            <CountPill key={pill.key} variant="ghost" className="px-0">
              <pill.icon className="size-3" />
              {pill.count} {pill.noun}
            </CountPill>
          ))
        ) : isSelf ? (
          <SelfShareNudge slug={slug} groupName={groupName} />
        ) : (
          <span className="text-muted-foreground/60 text-xs">Nothing shared yet</span>
        )}
      </div>

      <ContactMethodChips methods={member.contactMethods} compact className="relative" />

      {canKick || canPromote || canDemote ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Member actions"
                className="relative"
              />
            }
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
      ) : (
        // Empty span keeps the icon-sm button's footprint so the chevron column stays aligned.
        <span className="size-7 shrink-0" aria-hidden="true" />
      )}

      <ChevronRightIcon className="text-muted-foreground/50 size-4 shrink-0" aria-hidden="true" />
    </li>
  );
}
