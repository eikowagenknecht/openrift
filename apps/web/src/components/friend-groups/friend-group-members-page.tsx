import type {
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupRole,
} from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  EllipsisVerticalIcon,
  ShieldIcon,
  Trash2Icon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { getSiteUrl } from "@/lib/site-config";

import { ContactMethodChips } from "./contact-method-chips";
import { isAdmin, ROLE_LABEL } from "./friend-group-shell";

/**
 * The Members page: pending join requests (admins only) above the roster, each
 * member with self-nickname editing and admin role actions.
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
  const acceptInvite = useAcceptFriendGroupInvite();
  const declineInvite = useDeclineFriendGroupInvite();
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
            shareCounts={{
              wishlists: wishlistCountByUser.get(member.userId) ?? 0,
              tradelists: tradelistCountByUser.get(member.userId) ?? 0,
              collections: collectionCountByUser.get(member.userId) ?? 0,
            }}
          />
        ))}
      </div>
    </section>
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
  // Show only the non-zero shares, neutrally — "2 wishlists · 1 tradelist".
  // Nothing extra renders when a member shares nothing.
  const shareSummary = [
    shareCounts.wishlists > 0
      ? `${shareCounts.wishlists} ${shareCounts.wishlists === 1 ? "wishlist" : "wishlists"}`
      : null,
    shareCounts.tradelists > 0
      ? `${shareCounts.tradelists} ${shareCounts.tradelists === 1 ? "tradelist" : "tradelists"}`
      : null,
    shareCounts.collections > 0
      ? `${shareCounts.collections} ${shareCounts.collections === 1 ? "collection" : "collections"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
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
    <Card className="hover:bg-muted hover:text-foreground flex-row items-center gap-3 p-3 transition-colors">
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
        <span className="text-muted-foreground text-xs">
          {ROLE_LABEL[member.role]}
          {shareSummary ? ` · ${shareSummary}` : null}
        </span>
      </Link>
      <ContactMethodChips methods={member.contactMethods} className="justify-end" />

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
    </Card>
  );
}
