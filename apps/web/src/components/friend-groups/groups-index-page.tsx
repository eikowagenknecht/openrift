import type { FriendGroupRole } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon, PlusIcon, UsersIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { CoverBand } from "@/components/cover-band";
import { EmptyState } from "@/components/empty-state";
import { Heading } from "@/components/heading";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarPrimaryButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatarStack } from "@/components/user-avatar-stack";
import { useTradeActionCounts } from "@/hooks/use-card-trades";
import {
  useAcceptFriendGroupInvite,
  useCreateFriendGroup,
  useDeclineFriendGroupInvite,
  useFriendGroups,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

import { ShareListsWithGroupDialog } from "./share-lists-with-group-dialog";

const ROLE_BADGE: Record<FriendGroupRole, { label: string; className: string }> = {
  owner: { label: "Owner", className: "bg-primary text-primary-foreground" },
  admin: { label: "Admin", className: "bg-secondary text-secondary-foreground" },
  member: { label: "Member", className: "bg-muted text-muted-foreground" },
};

function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (group: { slug: string; name: string }) => void;
}) {
  const createGroup = useCreateFriendGroup();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [generateCode, setGenerateCode] = useState(true);
  const slugError =
    slug.length > 0 && !/^[a-z0-9][a-z0-9-]+$/u.test(slug)
      ? "Lowercase letters, digits, and dashes, starting with a letter or digit"
      : null;

  async function handleCreate() {
    if (!name.trim() || !slug.trim() || slugError) {
      return;
    }
    const group = await createGroup.mutateAsync({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      generateCode,
    });
    onOpenChange(false);
    // Hand off to the parent, which prompts the creator to share lists with
    // their new group and then navigates into it.
    onCreated({ slug: group.slug, name: name.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={handleCreate}>
          <DialogHeader>
            <DialogTitle>Create group</DialogTitle>
            <DialogDescription>
              Closed by default. Members opt in their own lists per group.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fg-name">Name</Label>
              <Input
                id="fg-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="Tuesday Night Crew"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fg-slug">URL slug</Label>
              <Input
                id="fg-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                maxLength={30}
                placeholder="tuesday-crew"
              />
              {slugError ? (
                <span className="text-destructive text-xs">{slugError}</span>
              ) : (
                <span className="text-muted-foreground text-xs">
                  Used in the URL: /groups/{slug || "your-slug"}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fg-desc">Description (optional)</Label>
              <Textarea
                id="fg-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="fg-code">Join code</Label>
                <span className="text-muted-foreground text-xs">
                  Generate a code so admins can share an invite link. You can rotate or disable it
                  later.
                </span>
              </div>
              <Switch id="fg-code" checked={generateCode} onCheckedChange={setGenerateCode} />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={!name.trim() || !slug.trim() || Boolean(slugError) || createGroup.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

export function GroupsIndexPage() {
  const { data } = useFriendGroups();
  const { data: actionCounts } = useTradeActionCounts();
  const actionCountByGroup = new Map(
    (actionCounts?.byGroup ?? []).map((entry) => [entry.groupId, entry]),
  );
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  // Set right after a member joins a group (accepts an invite) or creates one,
  // so we can prompt them to share their lists with it. `navigateOnClose` lands
  // the creator inside their new group once the prompt is dismissed.
  const [shareWithGroup, setShareWithGroup] = useState<{
    slug: string;
    name: string;
    navigateOnClose: boolean;
  } | null>(null);
  const acceptInvite = useAcceptFriendGroupInvite();
  const declineInvite = useDeclineFriendGroupInvite();
  const viewerId = useRequiredUserId();

  return (
    <>
      <PageTopBarSticky maxWidth="4xl">
        <PageTopBar>
          <PageTopBarTitle>Groups</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarButton render={<Link to="/groups/join" />}>Join with code</PageTopBarButton>
            <PageTopBarPrimaryButton onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New group
            </PageTopBarPrimaryButton>
            <CreateGroupDialog
              open={createOpen}
              onOpenChange={setCreateOpen}
              onCreated={(group) =>
                setShareWithGroup({ slug: group.slug, name: group.name, navigateOnClose: true })
              }
            />
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("mx-auto flex w-full max-w-4xl flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        {data.pendingInvites.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeading>Pending invites</SectionHeading>
            <div className="flex flex-col gap-2">
              {data.pendingInvites.map((invite) => (
                <Card
                  key={invite.id}
                  className="ring-border-accent/50 bg-border-accent/10 flex-row items-center gap-3 p-3"
                >
                  {invite.memberPreviews.length > 0 && (
                    <UserAvatarStack
                      members={invite.memberPreviews}
                      totalCount={invite.memberCount}
                      size="sm"
                      className="max-sm:hidden"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{invite.groupName}</span>
                    <span className="text-muted-foreground text-xs">
                      {invite.memberCount} {invite.memberCount === 1 ? "member" : "members"}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        acceptInvite.mutate(
                          { slug: invite.groupSlug, userId: viewerId },
                          {
                            onSuccess: () =>
                              setShareWithGroup({
                                slug: invite.groupSlug,
                                name: invite.groupName,
                                navigateOnClose: false,
                              }),
                          },
                        )
                      }
                      disabled={acceptInvite.isPending}
                    >
                      <CheckIcon className="size-4" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        declineInvite.mutate({ slug: invite.groupSlug, userId: viewerId })
                      }
                      disabled={declineInvite.isPending}
                    >
                      <XIcon className="size-4" />
                      Decline
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {data.outgoingRequests.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeading>Awaiting approval</SectionHeading>
            <div className="flex flex-col gap-2">
              {data.outgoingRequests.map((request) => (
                <Card key={request.id} className="flex-row items-center justify-between gap-3 p-3">
                  <Link
                    to="/groups/$slug"
                    params={{ slug: request.groupSlug }}
                    className="flex min-w-0 flex-col"
                  >
                    <span className="truncate font-medium hover:underline">
                      {request.groupName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {request.memberCount} {request.memberCount === 1 ? "member" : "members"}
                    </span>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      declineInvite.mutate({ slug: request.groupSlug, userId: viewerId })
                    }
                    disabled={declineInvite.isPending}
                  >
                    <XIcon className="size-4" />
                    Cancel request
                  </Button>
                </Card>
              ))}
            </div>
          </section>
        )}

        {data.items.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={UsersIcon}
            title="You're not in any groups yet."
            description={
              <>
                Create one above, or paste an invite code to join.{" "}
                <Link
                  to="/help/$slug"
                  params={{ slug: "groups" }}
                  className="text-primary hover:underline"
                >
                  Learn how groups work.
                </Link>
              </>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.items.map((row) => {
              const badge = ROLE_BADGE[row.viewerRole];
              const actions = actionCountByGroup.get(row.id);
              // The two kinds of trade action are what the viewer does next, not
              // one undifferentiated pile: answering a request is a decision
              // someone else is blocked on, confirming your own half of a swap
              // is yours to do whenever it happens. Each gets its own badge so a
              // group with 40 unconfirmed swaps doesn't read as 40 decisions.
              const respondCount = actions?.respondCount ?? 0;
              const settleCount = actions?.settleCount ?? 0;
              // Anything that asks the viewer to act (trade actions, join
              // requests to review) gets the StatTile accent ring so the
              // group that needs you stands out from across the grid.
              const needsViewer = (actions?.count ?? 0) > 0 || row.pendingRequestCount > 0;
              return (
                <CardLink
                  key={row.id}
                  render={<Link to="/groups/$slug" params={{ slug: row.slug }} />}
                  className={cn(
                    "flex-col gap-0 py-0",
                    needsViewer && "ring-primary/40 hover:ring-primary/50",
                  )}
                >
                  <CoverBand aria-hidden="true" className="flex h-28 items-center justify-center">
                    <UserAvatarStack
                      members={row.memberPreviews}
                      totalCount={row.memberCount}
                      size="lg"
                    />
                  </CoverBand>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Heading className="min-w-0 truncate">{row.name}</Heading>
                      <Badge className={cn("shrink-0", badge.className)}>{badge.label}</Badge>
                      {respondCount > 0 || settleCount > 0 ? (
                        // A decision the viewer owes someone else outranks their
                        // own housekeeping, so the request badge keeps the
                        // filled primary and the swap one steps down to the tint.
                        <div className="ml-auto flex flex-wrap items-center gap-1.5">
                          {respondCount > 0 ? (
                            <Badge className="whitespace-nowrap">
                              {respondCount} trade request{respondCount === 1 ? "" : "s"}
                            </Badge>
                          ) : null}
                          {settleCount > 0 ? (
                            <Badge variant="subtle" className="whitespace-nowrap">
                              {settleCount} swap{settleCount === 1 ? "" : "s"} to confirm
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {row.pendingRequestCount > 0 ? (
                      <span className="text-primary text-sm font-medium">
                        {row.pendingRequestCount} request
                        {row.pendingRequestCount === 1 ? "" : "s"} to review
                      </span>
                    ) : null}
                    {row.description ? (
                      <p className="text-muted-foreground line-clamp-2 text-sm">
                        {row.description}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground mt-auto pt-1 text-sm tabular-nums">
                      {row.memberCount} {row.memberCount === 1 ? "member" : "members"}
                      <span className="mx-1.5 opacity-60">·</span>
                      {row.sharedListCount} shared {row.sharedListCount === 1 ? "list" : "lists"}
                    </p>
                  </div>
                </CardLink>
              );
            })}
          </div>
        )}
      </div>
      {shareWithGroup && (
        <ShareListsWithGroupDialog
          slug={shareWithGroup.slug}
          groupName={shareWithGroup.name}
          open
          onOpenChange={(open) => {
            if (!open) {
              if (shareWithGroup.navigateOnClose) {
                void navigate({ to: "/groups/$slug", params: { slug: shareWithGroup.slug } });
              }
              setShareWithGroup(null);
            }
          }}
        />
      )}
    </>
  );
}
