import type {
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupRole,
} from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  EllipsisVerticalIcon,
  FolderIcon,
  ShieldIcon,
  Trash2Icon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { ActionBand } from "@/components/ui/action-band";
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
import {
  useAcceptFriendGroupInvite,
  useDeclineFriendGroupInvite,
  useFriendGroupDetail,
  useKickFriendGroupMember,
  useTransferFriendGroupOwnership,
  useUpdateFriendGroupRole,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { formatAbsoluteDate } from "@/lib/format-date";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { getSiteUrl } from "@/lib/site-config";
import { cn } from "@/lib/utils";

import { ContactMethodChips } from "./contact-method-chips";
import { isAdmin, ROLE_LABEL } from "./friend-group-shell";
import { LIST_INTENT_ICON, LIST_INTENT_NOUN } from "./list-intent-meta";

/**
 * The Members page: pending join requests (admins only) as the page's action
 * band above the roster, each member row with a role chip, join date, share
 * pills, contact chips, and the admin role actions.
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
        <div className="flex flex-col gap-2">
          {data.members.map((member) => (
            <MemberRow
              key={member.userId}
              slug={slug}
              member={member}
              viewerId={viewerId}
              viewerRole={viewerRole}
              shareCounts={{
                wishlists: wishlistCountByUser.get(member.userId) ?? 0,
                tradelists: tradelistCountByUser.get(member.userId) ?? 0,
                collections: collectionCountByUser.get(member.userId) ?? 0,
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * The pending join requests as the page's accented action band (the overview's
 * trades-hub treatment): a headline count, then one row per request with
 * inline approve / deny. Only rendered for admins with requests waiting.
 * @returns The requests band.
 */
function PendingRequestsBand({
  slug,
  requests,
}: {
  slug: string;
  requests: FriendGroupDetailResponse["pendingRequests"];
}) {
  const acceptInvite = useAcceptFriendGroupInvite();
  const declineInvite = useDeclineFriendGroupInvite();
  return (
    <ActionBand
      icon={UserPlusIcon}
      accent
      label="Requests"
      value={requests.length}
      sub={`${requests.length === 1 ? "person" : "people"} waiting to join`}
    >
      <div className="flex flex-col gap-2">
        {requests.map((req) => (
          <div
            key={req.id}
            className="bg-muted/40 flex items-center gap-2.5 rounded-lg px-2.5 py-2"
          >
            <UserAvatar
              image={req.userImage}
              name={req.userName}
              gravatarHash={req.gravatarHash}
              size="sm"
              className="size-7"
            />
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium">{req.userName ?? "Unknown user"}</span>
              <span className="text-muted-foreground">
                {" "}
                · requested {formatRelativeTime(req.createdAt)}
              </span>
            </span>
            <Button
              size="sm"
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
        ))}
      </div>
    </ActionBand>
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
        try {
          await navigator.clipboard.writeText(joinUrl);
          toast.success("Invite link copied. Send it to whoever you want to join");
        } catch {
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

function MemberRow({
  slug,
  member,
  viewerId,
  viewerRole,
  shareCounts,
}: {
  slug: string;
  member: FriendGroupMemberResponse;
  viewerId: string;
  viewerRole: FriendGroupRole;
  shareCounts: { wishlists: number; tradelists: number; collections: number };
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
  const transferOwnership = useTransferFriendGroupOwnership();

  const canKick =
    isAdmin(viewerRole) &&
    !isSelf &&
    member.role !== "owner" &&
    (member.role !== "admin" || viewerRole === "owner");
  // Only the owner promotes to / demotes from admin.
  const canPromote = viewerRole === "owner" && !isSelf && member.role !== "admin";
  const canDemote = viewerRole === "owner" && !isSelf && member.role === "admin";
  const canTransfer = viewerRole === "owner" && !isSelf && member.role !== "owner";

  return (
    <Card className={cn(cardLinkVariants(), "flex-row items-center gap-3 p-3")}>
      <UserAvatar
        image={member.userImage}
        name={member.userName}
        gravatarHash={member.gravatarHash}
        className="size-11"
      />
      <Link
        to="/groups/$slug/members/$userId"
        params={{ slug, userId: member.userId }}
        className="flex min-w-0 flex-1 flex-col gap-0.5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{member.userName ?? "Unknown user"}</span>
          {member.role === "member" ? null : (
            <Badge variant={ROLE_BADGE_VARIANT[member.role]}>{ROLE_LABEL[member.role]}</Badge>
          )}
          {isSelf ? <Badge variant="muted">You</Badge> : null}
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
          <span>
            Joined {formatAbsoluteDate(member.joinedAt, { month: "short", year: "numeric" })}
          </span>
          {sharePills.map((pill) => (
            <CountPill key={pill.key} variant="ghost" className="px-0">
              <pill.icon className="size-3" />
              {pill.count} {pill.count === 1 ? pill.noun : `${pill.noun}s`}
            </CountPill>
          ))}
        </span>
      </Link>
      <ContactMethodChips methods={member.contactMethods} className="justify-end" />

      {canKick || canPromote || canDemote || canTransfer ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="icon-sm" variant="ghost" aria-label="Member actions" />}
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
      ) : (
        // Rows without a menu (your own row, members a plain admin can't
        // touch) keep the contact chips column aligned with the rows above.
        <span aria-hidden="true" className="size-7 shrink-0" />
      )}
    </Card>
  );
}
