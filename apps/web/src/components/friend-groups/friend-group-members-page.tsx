import type {
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupRole,
} from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  EllipsisVerticalIcon,
  FolderIcon,
  ShieldIcon,
  Trash2Icon,
  UserPlusIcon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cardLinkVariants } from "@/components/ui/card-link";
import { CountPill } from "@/components/ui/count-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
  useFriendGroupDetail,
  useKickFriendGroupMember,
  useUpdateFriendGroupRole,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { formatAbsoluteDate } from "@/lib/format-date";
import { getSiteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";

import { ContactMethodChips } from "./contact-method-chips";
import { isAdmin, ROLE_LABEL } from "./friend-group-shell";
import { LIST_INTENT_ICON, LIST_INTENT_NOUN } from "./list-intent-meta";
import { PendingRequestsBand } from "./pending-requests-band";

/**
 * The Members page: pending join requests (admins only) as the page's action
 * band above the roster, then the members as a card grid (the "team wall") —
 * each card with a role-ringed avatar, role/You/New chips, join date, the
 * member's lifetime traded count, share pills, contact chips, and the admin
 * role actions.
 * @returns The members-page content.
 */
export function MembersPageContent({
  slug,
  data,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
}) {
  const viewerId = useRequiredUserId();
  const viewerRole = data.viewerRole ?? "member";
  // Per-member counts of what each shares with the group, shown neutrally on
  // their row. Organize lists don't count toward trading, so only wish/trade
  // lists and collections are tallied.
  const wishlistCountByUser = new Map<string, number>();
  const tradelistCountByUser = new Map<string, number>();
  for (const share of data.shares) {
    if (share.listIntent === "wish") {
      wishlistCountByUser.set(share.userId, (wishlistCountByUser.get(share.userId) ?? 0) + 1);
    } else if (share.listIntent === "trade") {
      tradelistCountByUser.set(share.userId, (tradelistCountByUser.get(share.userId) ?? 0) + 1);
    }
  }
  const collectionCountByUser = new Map<string, number>();
  for (const share of data.collectionShares) {
    collectionCountByUser.set(share.userId, (collectionCountByUser.get(share.userId) ?? 0) + 1);
  }

  const ownerCount = data.members.filter((member) => member.role === "owner").length;
  const adminCount = data.members.filter((member) => member.role === "admin").length;
  const roleTally = [
    `${ownerCount} ${ownerCount === 1 ? "owner" : "owners"}`,
    ...(adminCount > 0 ? [`${adminCount} ${adminCount === 1 ? "admin" : "admins"}`] : []),
  ].join(" · ");

  return (
    <div className="flex flex-col gap-6">
      {isAdmin(viewerRole) && data.pendingRequests.length > 0 ? (
        <PendingRequestsBand slug={slug} requests={data.pendingRequests} />
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2.5">
          <SectionHeading count={data.members.length}>Members</SectionHeading>
          <span className="text-muted-foreground/60 text-xs">{roleTally}</span>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
          {data.members.map((member) => (
            <li key={member.userId}>
              <MemberCard
                slug={slug}
                member={member}
                viewerId={viewerId}
                viewerRole={viewerRole}
                shareCounts={{
                  wishlists: wishlistCountByUser.get(member.userId) ?? 0,
                  tradelists: tradelistCountByUser.get(member.userId) ?? 0,
                  collections: collectionCountByUser.get(member.userId) ?? 0,
                }}
                cardsTraded={data.cardsTradedByMember[member.userId] ?? 0}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * The Members page's top-bar action: an Invite button for admins/owners that
 * copies the join link (or routes to Manage when the group has no join code).
 * Hidden for everyone else. Reads the (already-loaded) group from the cache so
 * the route can pass it as a plain element.
 * @returns The invite action, or null.
 */
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
  return (
    <PageTopBarPrimaryButton
      onClick={async () => {
        const joinUrl = `${getSiteUrl()}/groups/join?code=${encodeURIComponent(code)}`;
        if (await copy(joinUrl)) {
          toast.success("Invite link copied. Send it to whoever you want to join");
        } else {
          // No clipboard (denied, insecure context): hand the code over on the
          // Manage page instead, where it is on screen and selectable.
          void navigate({ to: "/groups/$slug/manage", params: { slug } });
        }
      }}
    >
      <UserPlusIcon className="size-4" />
      Invite
    </PageTopBarPrimaryButton>
  );
}

/** Role chips reuse the app's tone ramp: gold for the owner, violet for
 * admins. Plain members carry no chip, so a chip always means something. */
const ROLE_BADGE_VARIANT = { owner: "warning", admin: "violet" } as const;

/** Avatar rings echo the role chips, so leadership reads at wall distance. */
const ROLE_AVATAR_RING = {
  owner: "ring-2 ring-amber-500/70 ring-offset-2 ring-offset-card",
  admin: "ring-2 ring-violet-500/60 ring-offset-2 ring-offset-card",
  member: "",
} as const;

/** How recently a member must have joined to carry the green "New" chip. */
const NEW_MEMBER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** @returns Whether the join date is inside the "New" chip window. */
function isNewMember(joinedAt: string): boolean {
  return Date.now() - Date.parse(joinedAt) < NEW_MEMBER_WINDOW_MS;
}

function MemberCard({
  slug,
  member,
  viewerId,
  viewerRole,
  shareCounts,
  cardsTraded,
}: {
  slug: string;
  member: FriendGroupMemberResponse;
  viewerId: string;
  viewerRole: FriendGroupRole;
  shareCounts: { wishlists: number; tradelists: number; collections: number };
  /** Cards the viewer has traded with this member here; 0 on the viewer's own card. */
  cardsTraded: number;
}) {
  const isSelf = member.userId === viewerId;
  // Only the non-zero shares render, as icon pills reusing the app's
  // list-intent icons. Nothing extra renders when a member shares nothing.
  const sharePills = [
    {
      key: "wish",
      icon: LIST_INTENT_ICON.wish,
      count: shareCounts.wishlists,
      noun: LIST_INTENT_NOUN.wish,
    },
    {
      key: "trade",
      icon: LIST_INTENT_ICON.trade,
      count: shareCounts.tradelists,
      noun: LIST_INTENT_NOUN.trade,
    },
    { key: "collection", icon: FolderIcon, count: shareCounts.collections, noun: "collection" },
  ].filter((pill) => pill.count > 0);
  const updateRole = useUpdateFriendGroupRole();
  const kickMember = useKickFriendGroupMember();

  const canKick =
    isAdmin(viewerRole) &&
    !isSelf &&
    member.role !== "owner" &&
    (member.role !== "admin" || viewerRole === "owner");
  // Only the owner promotes to / demotes from admin. Ownership transfer lives
  // on the Manage page, not in this menu.
  const canPromote = viewerRole === "owner" && !isSelf && member.role !== "admin";
  const canDemote = viewerRole === "owner" && !isSelf && member.role === "admin";

  return (
    <Card className={cn(cardLinkVariants(), "relative h-full gap-3 p-4")}>
      {canKick || canPromote || canDemote ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Member actions"
                className="absolute top-2.5 right-2.5"
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
      ) : null}
      <Link
        to="/groups/$slug/members/$userId"
        params={{ slug, userId: member.userId }}
        className="flex min-w-0 items-center gap-3 pr-8"
      >
        <UserAvatar
          image={member.userImage}
          name={member.userName}
          gravatarHash={member.gravatarHash}
          className={cn("size-13 shrink-0", ROLE_AVATAR_RING[member.role])}
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-medium break-words">{member.userName ?? "Unknown user"}</span>
          <span className="flex flex-wrap items-center gap-1">
            {member.role === "member" ? null : (
              <Badge variant={ROLE_BADGE_VARIANT[member.role]}>{ROLE_LABEL[member.role]}</Badge>
            )}
            {isSelf ? <Badge variant="muted">You</Badge> : null}
            {isNewMember(member.joinedAt) ? <Badge variant="success">New</Badge> : null}
          </span>
        </span>
      </Link>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
        <span>
          Joined {formatAbsoluteDate(member.joinedAt, { month: "short", year: "numeric" })}
        </span>
        {cardsTraded > 0 ? (
          <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
            <ZapIcon className="size-3" />
            {cardsTraded} traded with you
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
        {sharePills.length > 0 ? (
          sharePills.map((pill) => (
            <CountPill key={pill.key} variant="ghost" className="px-0">
              <pill.icon className="size-3" />
              {pill.count} {pill.count === 1 ? pill.noun : `${pill.noun}s`}
            </CountPill>
          ))
        ) : (
          <span className="text-muted-foreground/60 text-xs">Nothing shared yet</span>
        )}
      </div>
      <ContactMethodChips methods={member.contactMethods} className="mt-auto" />
    </Card>
  );
}
