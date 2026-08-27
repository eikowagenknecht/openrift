import { CONTACT_METHOD_LABELS, formatDay } from "@openrift/shared";
import type {
  FriendGroupDetailResponse,
  FriendGroupShareableListResponse,
  ListIntent,
  ListKind,
} from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpenIcon,
  BotIcon,
  CheckIcon,
  CopyIcon,
  CrownIcon,
  FolderIcon,
  HandshakeIcon,
  HeartIcon,
  KeyIcon,
  Trash2Icon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { TopBarBreadcrumbBar } from "@/components/layout/top-bar-breadcrumb";
import { listKindIcon } from "@/components/list/create-list-dialog";
import { ShareLinkRow } from "@/components/share/share-link-row";
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
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useContactMethods } from "@/hooks/use-contact-methods";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
  useCreateFriendGroupDiscordLinkCode,
  useDeleteFriendGroup,
  useDeleteFriendGroupDiscordLink,
  useDisableFriendGroupCode,
  useEnableFriendGroupCode,
  useFriendGroupDetail,
  useFriendGroupDiscordLinks,
  useFriendGroupShareableCollections,
  useFriendGroupShareableLists,
  useLeaveFriendGroup,
  useRotateFriendGroupCode,
  useShareCollectionWithFriendGroup,
  useShareListWithFriendGroup,
  useTransferFriendGroupOwnership,
  useUnshareCollectionFromFriendGroup,
  useUnshareListFromFriendGroup,
  useUpdateFriendGroup,
  useUpdateGroupContactReveal,
} from "@/hooks/use-friend-groups";
import { useServerSeededState } from "@/hooks/use-server-seeded-state";
import { useRequiredUserId } from "@/lib/auth-session";
import { getSiteUrl } from "@/lib/site-config";
import { cn, PAGE_PADDING } from "@/lib/utils";

import { isAdmin } from "./friend-group-shell";

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

interface FriendGroupManagePageProps {
  slug: string;
}

export function FriendGroupManagePage({ slug }: FriendGroupManagePageProps) {
  const { data } = useFriendGroupDetail(slug);
  const viewerRole = data.viewerRole ?? "member";

  return (
    <>
      <TopBarBreadcrumbBar
        segments={[
          { label: data.group.name, link: <Link to="/groups/$slug" params={{ slug }} /> },
          { label: "Manage" },
        ]}
      />
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", PAGE_PADDING)}>
        <Heading level={1}>Manage {data.group.name}</Heading>

        {isAdmin(viewerRole) ? <AdminSettings data={data} slug={slug} /> : null}
        {isAdmin(viewerRole) ? <DiscordPanel slug={slug} /> : null}
        <ContactSharingPanel data={data} slug={slug} />
        <ShareableListsPanel slug={slug} />
        <ShareableCollectionsPanel slug={slug} />
        <LeaveOrDeletePanel data={data} slug={slug} />
      </div>
    </>
  );
}

/**
 * Lets the viewer choose which of their account-level contact methods are
 * revealed to this group. Visible to every member, not just admins.
 * @returns The contact-sharing card.
 */
function ContactSharingPanel({ data, slug }: { data: FriendGroupDetailResponse; slug: string }) {
  const viewerId = useRequiredUserId();
  const { contactMethods } = useContactMethods();
  const reveal = useUpdateGroupContactReveal();

  const self = data.members.find((member) => member.userId === viewerId);
  const revealedIds = new Set((self?.contactMethods ?? []).map((method) => method.id));

  function toggle(methodId: string, next: boolean) {
    const ids = new Set(revealedIds);
    if (next) {
      ids.add(methodId);
    } else {
      ids.delete(methodId);
    }
    reveal.mutate({ slug, userId: viewerId, contactMethodIds: [...ids] });
  }

  return (
    // The id is the target of the overview's contacts nudge; the clearance
    // keeps the card below the header and the breadcrumb bar when it lands.
    <Card id="contacts" className="scroll-mt-28">
      <CardHeader>
        <CardTitle>Your contacts in this group</CardTitle>
        <CardDescription>
          Shown next to your name on the Members and Trades pages.{" "}
          <Link to="/profile" hash="contacts" className="underline">
            Edit them in your profile
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {contactMethods.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You haven&apos;t added any contact methods yet.
          </p>
        ) : (
          contactMethods.map((method) => (
            <Label
              key={method.id}
              className="flex items-center gap-3 font-normal"
              htmlFor={`reveal-${method.id}`}
            >
              <Checkbox
                id={`reveal-${method.id}`}
                checked={revealedIds.has(method.id)}
                onCheckedChange={(checked) => toggle(method.id, checked === true)}
                disabled={reveal.isPending}
              />
              <span className="text-muted-foreground text-sm">
                {CONTACT_METHOD_LABELS[method.type]}
              </span>
              <span className="truncate">{method.value}</span>
            </Label>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AdminSettings({ data, slug }: { data: FriendGroupDetailResponse; slug: string }) {
  const navigate = useNavigate();
  const update = useUpdateFriendGroup();
  const enableCode = useEnableFriendGroupCode();

  const [name, setName] = useServerSeededState(data.group.name);
  const [description, setDescription] = useServerSeededState(data.group.description ?? "");
  const [newSlug, setNewSlug] = useServerSeededState(data.group.slug);

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
      void navigate({ to: "/groups/$slug/manage", params: { slug: result.slug } });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Group settings</CardTitle>
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

        <Separator />

        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-2">
            <KeyIcon className="size-4" />
            Invite link
          </Label>
          {data.group.code ? (
            <InviteLinkPanel slug={slug} code={data.group.code} />
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Invites are turned off, so nobody can join this group right now.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => enableCode.mutate(slug)}
                disabled={enableCode.isPending}
              >
                Enable invites
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The invite link for a group that still accepts new members. The bare code is
 * deliberately not shown: nothing anywhere accepts a typed one, so displaying
 * it only invites someone to read out twelve case-sensitive characters.
 * @returns The invite-link panel.
 */
function InviteLinkPanel({ slug, code }: { slug: string; code: string }) {
  const rotateCode = useRotateFriendGroupCode();
  const disableCode = useDisableFriendGroupCode();
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);

  const joinUrl = `${getSiteUrl()}/groups/join?code=${encodeURIComponent(code)}`;

  return (
    <div className="flex flex-col gap-2">
      <ShareLinkRow
        url={joinUrl}
        label="Group invite link"
        defaultQrOpen
        actions={
          <>
            <Dialog open={rotateConfirmOpen} onOpenChange={setRotateConfirmOpen}>
              <DialogTrigger render={<Button variant="destructive" />}>Rotate</DialogTrigger>
              <DialogContent>
                <DialogForm
                  onSubmit={async () => {
                    await rotateCode.mutateAsync(slug);
                    setRotateConfirmOpen(false);
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>Rotate the invite link?</DialogTitle>
                    <DialogDescription>
                      The current link stops working immediately.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setRotateConfirmOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="destructive" disabled={rotateCode.isPending}>
                      Rotate
                    </Button>
                  </DialogFooter>
                </DialogForm>
              </DialogContent>
            </Dialog>
            <Dialog open={disableConfirmOpen} onOpenChange={setDisableConfirmOpen}>
              <DialogTrigger render={<Button variant="destructive" />}>Disable</DialogTrigger>
              <DialogContent>
                <DialogForm
                  onSubmit={async () => {
                    await disableCode.mutateAsync(slug);
                    setDisableConfirmOpen(false);
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>Turn off invites?</DialogTitle>
                    <DialogDescription>
                      The current link stops working immediately.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setDisableConfirmOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="destructive" disabled={disableCode.isPending}>
                      Disable
                    </Button>
                  </DialogFooter>
                </DialogForm>
              </DialogContent>
            </Dialog>
          </>
        }
      />
    </div>
  );
}

/**
 * Admin-only Discord linking: generate a one-time code, redeem it with the
 * bot's /link command in the server, and the bot may answer card mentions
 * there with who has the card on a tradelist shared with this group. While a
 * code is outstanding the links list polls, so the redeem shows up without a
 * reload.
 * @returns The Discord bot card.
 */
function DiscordPanel({ slug }: { slug: string }) {
  const createCode = useCreateFriendGroupDiscordLinkCode();
  const removeLink = useDeleteFriendGroupDiscordLink();
  const [pending, setPending] = useState<{
    code: string;
    knownLinkIds: string[];
  } | null>(null);
  const { copied, copy } = useCopyToClipboard();

  const { data } = useFriendGroupDiscordLinks(slug, {
    refetchInterval: pending === null ? undefined : 5000,
  });
  const redeemed =
    pending !== null && data.items.some((item) => !pending.knownLinkIds.includes(item.id));

  async function handleGenerate() {
    const result = await createCode.mutateAsync(slug);
    setPending({ code: result.code, knownLinkIds: data.items.map((item) => item.id) });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BotIcon className="size-4" />
          Discord bot
        </CardTitle>
        <CardDescription>
          The OpenRift bot answers card mentions in the linked server with who has the card on a
          shared tradelist. Anyone who can read that server sees those names and counts.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{item.guildName ?? `Server ${item.guildId}`}</span>
              <span className="text-muted-foreground text-sm">
                linked {formatDay(item.linkedAt)}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeLink.mutate({ slug, linkId: item.id })}
              disabled={removeLink.isPending}
            >
              <Trash2Icon className="size-4" />
              Unlink
            </Button>
          </div>
        ))}
        {data.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No server linked yet.</p>
        ) : null}
        {pending === null ? (
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={createCode.isPending}
            >
              Generate link code
            </Button>
          </div>
        ) : redeemed ? (
          <p className="text-sm">Server linked. Card mentions there now include tradelists.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              In your Discord server, run this command within 15 minutes (you need the Manage Server
              permission there):
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="bg-muted rounded px-2 py-1 font-mono text-sm">
                /link code:{pending.code}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void copy(`/link code:${pending.code}`)}
              >
                {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}
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
      <Card id="lists" className="scroll-mt-28">
        <CardHeader>
          <CardTitle>Share your lists</CardTitle>
          <CardDescription>
            No lists yet.{" "}
            <Link to="/collections" className="text-primary hover:underline">
              Create a wishlist or tradelist
            </Link>{" "}
            to share it here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    // The id is the target of the overview's shared-lists nudge.
    <Card id="lists" className="scroll-mt-28">
      <CardHeader>
        <CardTitle>Share your lists</CardTitle>
        <CardDescription>
          Visible to everyone in this group. Changes here don&apos;t affect other groups.
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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

function ShareableCollectionsPanel({ slug }: { slug: string }) {
  const { data } = useFriendGroupShareableCollections(slug);
  const share = useShareCollectionWithFriendGroup();
  const unshare = useUnshareCollectionFromFriendGroup();

  if (data.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Share your collections</CardTitle>
          <CardDescription>
            You don&apos;t have any personal collections yet. Create one to share it with this
            group.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Share your collections</CardTitle>
        <CardDescription>Visible (read-only) to everyone in this group.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data.items.map((row) => {
          const isShared = row.sharedAt !== null;
          return (
            <div key={row.collectionId} className="flex items-center gap-3">
              <Checkbox
                checked={isShared}
                onCheckedChange={(checked) => {
                  if (checked) {
                    share.mutate({ slug, collectionId: row.collectionId });
                  } else {
                    unshare.mutate({ slug, collectionId: row.collectionId });
                  }
                }}
                disabled={share.isPending || unshare.isPending}
              />
              <div className="flex items-center gap-2">
                <BookOpenIcon className="size-4" />
                <span className="font-medium">{row.collectionName}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * Owner-only ownership hand-off: pick another member, confirm, and the group
 * is theirs — the outgoing owner stays on as an admin. Hidden while the owner
 * is the only member (there is no one to hand the group to).
 * @returns The transfer control, or null.
 */
function TransferOwnershipControl({
  data,
  slug,
}: {
  data: FriendGroupDetailResponse;
  slug: string;
}) {
  const viewerId = useRequiredUserId();
  const transfer = useTransferFriendGroupOwnership();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const candidates = data.members.filter((member) => member.userId !== viewerId);
  if (candidates.length === 0) {
    return null;
  }
  const items = candidates.map((member) => ({
    value: member.userId,
    label: member.userName ?? "Unknown user",
  }));
  const target = candidates.find((member) => member.userId === targetId);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label className="flex items-center gap-2">
          <CrownIcon className="size-4" />
          Transfer ownership
        </Label>
        <p className="text-muted-foreground text-sm">
          Hand the group to another member. You stay in the group as an admin.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select items={items} value={targetId} onValueChange={(value) => setTargetId(value)}>
            <SelectTrigger className="w-56" aria-label="New owner">
              <SelectValue placeholder="Choose a member" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger render={<Button variant="outline" disabled={target === undefined} />}>
              Transfer ownership
            </DialogTrigger>
            <DialogContent>
              <DialogForm
                onSubmit={async () => {
                  if (!target) {
                    return;
                  }
                  await transfer.mutateAsync({ slug, userId: target.userId });
                  setConfirmOpen(false);
                }}
              >
                <DialogHeader>
                  <DialogTitle>Make {target?.userName ?? "this member"} the owner?</DialogTitle>
                  <DialogDescription>
                    They take over the group immediately, including these settings. You become an
                    admin and can&apos;t undo this yourself.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="destructive" disabled={transfer.isPending}>
                    Transfer
                  </Button>
                </DialogFooter>
              </DialogForm>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Separator />
    </>
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
        <CardTitle>Membership</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isOwner ? (
          <>
            <TransferOwnershipControl data={data} slug={slug} />
            <p className="text-muted-foreground text-sm">
              As the owner you can&apos;t leave the group yourself, transfer ownership first.
              Deleting it removes the group for everyone.
            </p>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger render={<Button variant="destructive" />}>
                <Trash2Icon className="size-4" />
                Delete group
              </DialogTrigger>
              <DialogContent>
                <DialogForm
                  onSubmit={async () => {
                    await remove.mutateAsync(slug);
                    void navigate({ to: "/groups" });
                  }}
                >
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
                    <Button type="submit" variant="destructive" disabled={remove.isPending}>
                      Delete
                    </Button>
                  </DialogFooter>
                </DialogForm>
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
