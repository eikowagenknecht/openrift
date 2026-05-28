import type {
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
  FriendGroupRole,
  FriendGroupShareableListResponse,
  ListIntent,
  ListKind,
} from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpenIcon,
  CheckIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  FolderIcon,
  HandshakeIcon,
  HeartIcon,
  KeyIcon,
  PlusIcon,
  ShieldIcon,
  Trash2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { Heading } from "@/components/heading";
import { listKindIcon } from "@/components/list/create-list-dialog";
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
import { UserAvatar } from "@/components/user-avatar";
import { useCollections } from "@/hooks/use-collections";
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
import { getSiteUrl } from "@/lib/site-config";
import { cn, PAGE_PADDING } from "@/lib/utils";

import { MatchRowGroup } from "./match-row-card";

const ROLE_LABEL: Record<FriendGroupRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const INTENT_LABEL: Record<ListIntent, string> = {
  wish: "Wishlist",
  trade: "Tradelist",
  organize: "Organize",
};

const INTENT_ICON: Record<ListIntent, ComponentType<SVGProps<SVGSVGElement>>> = {
  wish: HeartIcon,
  trade: HandshakeIcon,
  organize: FolderIcon,
};

const KIND_NOUN: Record<ListKind, { singular: string; plural: string }> = {
  card: { singular: "Card", plural: "Cards" },
  printing: { singular: "Printing", plural: "Printings" },
  copy: { singular: "Copy", plural: "Copies" },
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

function FriendGroupMemberView({ data, slug }: { data: FriendGroupDetailResponse; slug: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-8", PAGE_PADDING)}>
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Heading level={1}>{data.group.name}</Heading>
          <Badge variant="secondary">{ROLE_LABEL[data.viewerRole ?? "member"]}</Badge>
        </div>
        {data.group.description ? (
          <p className="text-muted-foreground">{data.group.description}</p>
        ) : null}
      </header>

      <MatchesSection slug={slug} data={data} />
      <CollectionsSection data={data} />
      <MembersSection data={data} slug={slug} />
      <SettingsSection data={data} slug={slug} />
    </div>
  );
}

function CollectionsSection({ data }: { data: FriendGroupDetailResponse }) {
  const { data: collections } = useCollections();
  const [createOpen, setCreateOpen] = useState(false);
  const groupCollections = collections.filter((col) => col.groupId === data.group.id);

  return (
    <section id="collections" className="flex scroll-mt-16 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Shared collections
        </h2>
        <Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          New shared collection
        </Button>
      </div>
      {groupCollections.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No shared collections yet. Any member can create one. A shared collection is a pooled
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
                className="hover:bg-accent flex items-center gap-2 rounded-md px-3 py-2"
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
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);

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
                onClick={() =>
                  navigator.clipboard.writeText(
                    `${getSiteUrl()}/groups/join?code=${encodeURIComponent(data.group.code ?? "")}`,
                  )
                }
              >
                <CopyIcon className="size-4" />
                Copy link
              </Button>
              <Dialog open={rotateConfirmOpen} onOpenChange={setRotateConfirmOpen}>
                <DialogTrigger render={<Button size="sm" variant="destructive" />}>
                  Rotate
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Rotate the join code?</DialogTitle>
                    <DialogDescription>
                      The current code stops working immediately. Anyone holding an old invite link
                      will need a new one.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setRotateConfirmOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        await rotateCode.mutateAsync(slug);
                        setRotateConfirmOpen(false);
                      }}
                      disabled={rotateCode.isPending}
                    >
                      Rotate
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={disableConfirmOpen} onOpenChange={setDisableConfirmOpen}>
                <DialogTrigger render={<Button size="sm" variant="destructive" />}>
                  Disable
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Disable code-based joining?</DialogTitle>
                    <DialogDescription>
                      The code stops working immediately. New members will only be able to join via
                      direct email invites until you re-enable code-based joining.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setDisableConfirmOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        await disableCode.mutateAsync(slug);
                        setDisableConfirmOpen(false);
                      }}
                      disabled={disableCode.isPending}
                    >
                      Disable
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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
            share it with this group.{" "}
            <Link
              to="/help/$slug"
              params={{ slug: "lists" }}
              className="text-primary hover:underline"
            >
              Learn how lists work.
            </Link>
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
          Shared lists are visible to everyone in this group. Each list is shared with each group
          separately, so changes here don&apos;t affect any other groups you&apos;ve shared it with.
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
  const IntentIcon = INTENT_ICON[row.listIntent];
  const KindIcon = listKindIcon(row.listKind);
  const kindNoun =
    row.entryCount === 1 ? KIND_NOUN[row.listKind].singular : KIND_NOUN[row.listKind].plural;
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
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.listName}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-2xs gap-1">
              <IntentIcon className="size-3" />
              {INTENT_LABEL[row.listIntent]}
            </Badge>
            <Badge variant="outline" className="text-2xs gap-1">
              <KindIcon className="size-3" />
              {row.entryCount} {kindNoun}
            </Badge>
          </div>
        </div>
      </div>
      {row.listIntent === "organize" ? (
        <Badge variant="outline" className="text-xs">
          Informational only, doesn&apos;t appear in matches
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
