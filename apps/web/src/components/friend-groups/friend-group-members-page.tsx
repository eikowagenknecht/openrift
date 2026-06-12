import type {
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupRole,
} from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  EllipsisVerticalIcon,
  ScaleIcon,
  ShieldIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import {
  useAcceptFriendGroupInvite,
  useDeclineFriendGroupInvite,
  useKickFriendGroupMember,
  useTransferFriendGroupOwnership,
  useUpdateFriendGroupNickname,
  useUpdateFriendGroupRole,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";

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
  // Members whose wish/trade lists are visible here — the ones who can show
  // up in matches. Organize lists don't count toward trading.
  const sharingUserIds = new Set(
    data.shares
      .filter((share) => share.listIntent === "wish" || share.listIntent === "trade")
      .map((share) => share.userId),
  );

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
            sharesLists={sharingUserIds.has(member.userId)}
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
  sharesLists,
}: {
  slug: string;
  member: FriendGroupMemberResponse;
  viewerId: string;
  viewerRole: FriendGroupRole;
  sharesLists: boolean;
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
  // Admins manage member <-> judge; only the owner promotes to / demotes from admin.
  const canPromote = viewerRole === "owner" && !isSelf && member.role !== "admin";
  const canMakeJudge = isAdmin(viewerRole) && !isSelf && member.role === "member";
  const canUnmakeJudge = isAdmin(viewerRole) && !isSelf && member.role === "judge";
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
        <span className="text-muted-foreground text-xs">
          {ROLE_LABEL[member.role]}
          {sharesLists ? null : (
            <span className={isSelf ? "text-amber-700 dark:text-amber-400" : undefined}>
              {" "}
              · {isSelf ? "you're not sharing any lists" : "not sharing lists"}
            </span>
          )}
        </span>
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

      {(canKick || canPromote || canMakeJudge || canUnmakeJudge || canDemote || canTransfer) && (
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
            {canMakeJudge && (
              <DropdownMenuItem
                onClick={() => updateRole.mutate({ slug, userId: member.userId, role: "judge" })}
              >
                <ScaleIcon className="size-4" />
                Make judge
              </DropdownMenuItem>
            )}
            {canUnmakeJudge && (
              <DropdownMenuItem
                onClick={() => updateRole.mutate({ slug, userId: member.userId, role: "member" })}
              >
                Remove judge role
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
