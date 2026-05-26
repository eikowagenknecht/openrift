import type {
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupRole,
  FriendGroupShareableListResponse,
} from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  KeyIcon,
  ShieldIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAcceptFriendGroupInvite,
  useDeclineFriendGroupInvite,
  useDeleteFriendGroup,
  useDisableFriendGroupCode,
  useEnableFriendGroupCode,
  useFriendGroupDetail,
  useFriendGroupMatches,
  useFriendGroupShareableLists,
  useInviteFriendByEmail,
  useKickFriendGroupMember,
  useLeaveFriendGroup,
  useRotateFriendGroupCode,
  useShareListWithFriendGroup,
  useTransferFriendGroupOwnership,
  useUnshareListFromFriendGroup,
  useUpdateFriendGroup,
  useUpdateFriendGroupNickname,
  useUpdateFriendGroupRole,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { cn, PAGE_PADDING } from "@/lib/utils";

import { MatchRowGroup } from "./match-row-card";

const ROLE_LABEL: Record<FriendGroupRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

function isAdmin(role: FriendGroupRole | null): role is "admin" | "owner" {
  return role === "admin" || role === "owner";
}

interface FriendGroupPageProps {
  slug: string;
}

export function FriendGroupPage({ slug }: FriendGroupPageProps) {
  const { data } = useFriendGroupDetail(slug);
  if (data.viewerStatus === "pending") {
    return <PendingApprovalStub data={data} />;
  }
  return <FriendGroupMemberView data={data} slug={slug} />;
}

function PendingApprovalStub({ data }: { data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const declineInvite = useDeclineFriendGroupInvite();
  const navigate = useNavigate();
  return (
    <div className={cn("mx-auto flex w-full max-w-md flex-col gap-4 text-center", PAGE_PADDING)}>
      <h1 className="text-2xl font-semibold">{data.group.name}</h1>
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

function FriendGroupMemberView({ data, slug }: { data: FriendGroupDetailResponse; slug: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-8", PAGE_PADDING)}>
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{data.group.name}</h1>
          <Badge variant="secondary">{ROLE_LABEL[data.viewerRole ?? "member"]}</Badge>
        </div>
        {data.group.description ? (
          <p className="text-muted-foreground">{data.group.description}</p>
        ) : null}
      </header>

      <MatchesSection slug={slug} data={data} />
      <MembersSection data={data} slug={slug} />
      <SettingsSection data={data} slug={slug} />
    </div>
  );
}

function MatchesSection({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: matches } = useFriendGroupMatches(slug);
  const viewerId = useRequiredUserId();
  const viewerShares = data.shares.filter((share) => share.userId === viewerId);
  const othersShare = data.shares.some((share) => share.userId !== viewerId);

  return (
    <section id="matches" className="flex scroll-mt-16 flex-col gap-4">
      <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">Matches</h2>

      <div className="flex flex-col gap-4">
        <h3 className="font-semibold">Members have what you want</h3>
        {matches.othersHaveYourWants.length > 0 ? (
          <MatchRowGroup rows={matches.othersHaveYourWants} groupSlug={slug} linkCounterparty />
        ) : (
          <EmptyMatchPanel
            viewerHasShares={viewerShares.some((s) => s.listIntent === "wish")}
            othersHaveShares={othersShare}
            mode="wants"
          />
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="font-semibold">Members want what you have</h3>
        {matches.othersWantYourHaves.length > 0 ? (
          <MatchRowGroup rows={matches.othersWantYourHaves} groupSlug={slug} linkCounterparty />
        ) : (
          <EmptyMatchPanel
            viewerHasShares={viewerShares.some((s) => s.listIntent === "trade")}
            othersHaveShares={othersShare}
            mode="haves"
          />
        )}
      </div>
    </section>
  );
}

function EmptyMatchPanel({
  viewerHasShares,
  othersHaveShares,
  mode,
}: {
  viewerHasShares: boolean;
  othersHaveShares: boolean;
  mode: "wants" | "haves";
}) {
  if (!othersHaveShares) {
    return (
      <p className="text-muted-foreground">
        No members are sharing lists with this group yet. Ask them to share a wishlist or tradelist
        to start seeing matches.
      </p>
    );
  }
  if (!viewerHasShares) {
    return (
      <p className="text-muted-foreground">
        Share at least one {mode === "wants" ? "wishlist" : "tradelist"} with this group to see what
        members can {mode === "wants" ? "offer" : "want"}.
      </p>
    );
  }
  return (
    <p className="text-muted-foreground">
      No matches right now. You&apos;ll see opportunities here when someone&apos;s
      {mode === "wants" ? " haves" : " wants"} overlap with someone&apos;s
      {mode === "wants" ? " wants" : " haves"}.
    </p>
  );
}

function MembersSection({ data, slug }: { data: FriendGroupDetailResponse; slug: string }) {
  const viewerId = useRequiredUserId();
  const viewerRole = data.viewerRole ?? "member";
  const acceptInvite = useAcceptFriendGroupInvite();
  const declineInvite = useDeclineFriendGroupInvite();

  return (
    <section id="members" className="flex scroll-mt-16 flex-col gap-4">
      <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">Members</h2>

      {isAdmin(viewerRole) && data.pendingRequests.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
          <h3 className="font-medium">Pending requests</h3>
          <div className="flex flex-col gap-2">
            {data.pendingRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {req.userImage ? (
                    <img src={req.userImage} alt="" className="size-7 rounded-full" />
                  ) : (
                    <div className="bg-muted size-7 rounded-full" />
                  )}
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
      {member.userImage ? (
        <img src={member.userImage} alt="" className="size-9 rounded-full" />
      ) : (
        <div className="bg-muted size-9 rounded-full" />
      )}
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
                onSelect={() => updateRole.mutate({ slug, userId: member.userId, role: "admin" })}
              >
                <ShieldIcon className="size-4" />
                Promote to admin
              </DropdownMenuItem>
            )}
            {canDemote && (
              <DropdownMenuItem
                onSelect={() => updateRole.mutate({ slug, userId: member.userId, role: "member" })}
              >
                Demote to member
              </DropdownMenuItem>
            )}
            {canTransfer && (
              <DropdownMenuItem
                onSelect={() => transferOwnership.mutate({ slug, userId: member.userId })}
              >
                Transfer ownership
              </DropdownMenuItem>
            )}
            {canKick && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => kickMember.mutate({ slug, userId: member.userId })}
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

function SettingsSection({ data, slug }: { data: FriendGroupDetailResponse; slug: string }) {
  const viewerRole = data.viewerRole ?? "member";
  return (
    <section id="settings" className="flex scroll-mt-16 flex-col gap-4">
      <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
        Settings
      </h2>
      {isAdmin(viewerRole) ? <AdminSettings data={data} slug={slug} /> : null}
      <ShareableListsPanel slug={slug} />
      <LeaveOrDeletePanel data={data} slug={slug} />
    </section>
  );
}

function AdminSettings({ data, slug }: { data: FriendGroupDetailResponse; slug: string }) {
  const navigate = useNavigate();
  const update = useUpdateFriendGroup();
  const rotateCode = useRotateFriendGroupCode();
  const disableCode = useDisableFriendGroupCode();
  const enableCode = useEnableFriendGroupCode();
  const invite = useInviteFriendByEmail();

  const [name, setName] = useState(data.group.name);
  const [description, setDescription] = useState(data.group.description ?? "");
  const [newSlug, setNewSlug] = useState(data.group.slug);
  const [inviteEmail, setInviteEmail] = useState("");

  const slugChanged = newSlug !== data.group.slug;

  async function handleSave() {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const result = await update.mutateAsync({
      slug,
      name: trimmedName === data.group.name ? undefined : trimmedName,
      description:
        trimmedDescription === (data.group.description ?? "")
          ? undefined
          : trimmedDescription || null,
      newSlug: slugChanged ? newSlug.trim() : undefined,
    });
    if (slugChanged) {
      void navigate({ to: "/groups/$slug", params: { slug: result.slug } });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Group settings</CardTitle>
        <CardDescription>Visible to admins and the owner only.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fg-edit-name">Name</Label>
          <Input
            id="fg-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fg-edit-slug">Slug</Label>
          <Input
            id="fg-edit-slug"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
            maxLength={30}
          />
          {slugChanged ? (
            <span className="text-xs text-amber-700">
              Renaming the slug breaks any existing bookmarks to this group.
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fg-edit-desc">Description</Label>
          <Textarea
            id="fg-edit-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={update.isPending}>
            Save changes
          </Button>
        </div>

        <hr />

        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-2">
            <KeyIcon className="size-4" />
            Join code
          </Label>
          {data.group.code ? (
            <div className="flex items-center gap-2">
              <code className="bg-muted flex-1 rounded px-2 py-1 font-mono text-sm">
                {data.group.code}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(data.group.code ?? "")}
              >
                <CopyIcon className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => rotateCode.mutate(slug)}
                disabled={rotateCode.isPending}
              >
                Rotate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => disableCode.mutate(slug)}
                disabled={disableCode.isPending}
              >
                Disable
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Code-based joining is disabled. Direct invites only.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => enableCode.mutate(slug)}
                disabled={enableCode.isPending}
              >
                Enable code
              </Button>
            </div>
          )}
        </div>

        <hr />

        <div className="flex flex-col gap-2">
          <Label htmlFor="fg-invite-email" className="flex items-center gap-2">
            <UsersIcon className="size-4" />
            Invite by email
          </Label>
          <div className="flex gap-2">
            <Input
              id="fg-invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="friend@example.com"
            />
            <Button
              onClick={async () => {
                await invite.mutateAsync({ slug, email: inviteEmail.trim() });
                setInviteEmail("");
              }}
              disabled={!inviteEmail || invite.isPending}
            >
              Send invite
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ShareableListsPanel({ slug }: { slug: string }) {
  const { data } = useFriendGroupShareableLists(slug);
  const share = useShareListWithFriendGroup();
  const unshare = useUnshareListFromFriendGroup();

  if (data.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Share your lists</CardTitle>
          <CardDescription>
            You don&apos;t have any lists yet. Create a wishlist, tradelist, or organize list to
            share it with this group.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Share your lists</CardTitle>
        <CardDescription>
          Sharing makes a list visible to every member. Unsharing is just for this group.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data.items.map((row) => (
          <ShareableListRow
            key={row.listId}
            slug={slug}
            row={row}
            share={share}
            unshare={unshare}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ShareableListRow({
  slug,
  row,
  share,
  unshare,
}: {
  slug: string;
  row: FriendGroupShareableListResponse;
  share: ReturnType<typeof useShareListWithFriendGroup>;
  unshare: ReturnType<typeof useUnshareListFromFriendGroup>;
}) {
  const isShared = row.sharedAt !== null;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={isShared}
          onCheckedChange={(checked) => {
            if (checked) {
              share.mutate({ slug, listId: row.listId });
            } else {
              unshare.mutate({ slug, listId: row.listId });
            }
          }}
          disabled={share.isPending || unshare.isPending}
        />
        <div className="flex flex-col">
          <span className="font-medium">{row.listName}</span>
          <span className="text-muted-foreground text-xs">
            {row.listIntent} · {row.listKind}
          </span>
        </div>
      </div>
      {row.listIntent === "organize" ? (
        <Badge variant="outline" className="text-xs">
          Informational only — doesn&apos;t appear in matches
        </Badge>
      ) : null}
    </div>
  );
}

function LeaveOrDeletePanel({ data, slug }: { data: FriendGroupDetailResponse; slug: string }) {
  const navigate = useNavigate();
  const leave = useLeaveFriendGroup();
  const remove = useDeleteFriendGroup();
  const isOwner = data.viewerRole === "owner";
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Membership</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isOwner ? (
          <>
            <p className="text-muted-foreground text-sm">
              You&apos;re the owner. Transfer ownership to another member before leaving.
            </p>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger render={<Button variant="destructive" />}>
                <Trash2Icon className="size-4" />
                Delete group
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this group?</DialogTitle>
                  <DialogDescription>
                    The group, its members, invites, and list-shares will be permanently removed.
                    Lists themselves stay; only their share with this group goes.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      await remove.mutateAsync(slug);
                      void navigate({ to: "/groups" });
                    }}
                    disabled={remove.isPending}
                  >
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <Button
            variant="ghost"
            onClick={async () => {
              await leave.mutateAsync(slug);
              void navigate({ to: "/groups" });
            }}
            disabled={leave.isPending}
          >
            Leave group
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
