import type { FriendGroupRole } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon, ChevronRightIcon, PlusIcon, UsersIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTradeActionCounts } from "@/hooks/use-card-trades";
import {
  useAcceptFriendGroupInvite,
  useCreateFriendGroup,
  useDeclineFriendGroupInvite,
  useFriendGroups,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

import { SECTION_HEADING } from "./friend-group-shell";
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
            onClick={handleCreate}
            disabled={!name.trim() || !slug.trim() || Boolean(slugError) || createGroup.isPending}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GroupsIndexPage() {
  const { data } = useFriendGroups();
  const { data: actionCounts } = useTradeActionCounts();
  const actionCountByGroup = new Map(
    (actionCounts?.byGroup ?? []).map((entry) => [entry.groupId, entry.count]),
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
            <h2 className={SECTION_HEADING}>Pending invites</h2>
            <div className="flex flex-col gap-2">
              {data.pendingInvites.map((invite) => (
                <Card key={invite.id} className="flex-row items-center justify-between gap-3 p-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{invite.groupName}</span>
                    <span className="text-muted-foreground text-xs">
                      /groups/{invite.groupSlug}
                    </span>
                  </div>
                  <div className="flex gap-2">
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
            <h2 className={SECTION_HEADING}>Awaiting approval</h2>
            <div className="flex flex-col gap-2">
              {data.outgoingRequests.map((request) => (
                <Card key={request.id} className="flex-row items-center justify-between gap-3 p-3">
                  <Link
                    to="/groups/$slug"
                    params={{ slug: request.groupSlug }}
                    className="flex flex-col"
                  >
                    <span className="font-medium hover:underline">{request.groupName}</span>
                    <span className="text-muted-foreground text-xs">
                      /groups/{request.groupSlug}
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
          <div className="flex flex-col gap-2">
            {data.items.map((row) => {
              const badge = ROLE_BADGE[row.viewerRole];
              const actionCount = actionCountByGroup.get(row.id) ?? 0;
              return (
                <Link key={row.id} to="/groups/$slug" params={{ slug: row.slug }} className="block">
                  <Card className="hover:bg-muted flex-row items-start gap-4 p-4 transition-colors sm:items-center">
                    <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
                      <UsersIcon className="size-5" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium break-words sm:truncate">{row.name}</span>
                          <Badge className={cn("shrink-0", badge.className)}>{badge.label}</Badge>
                        </div>
                        {row.description ? (
                          <span className="text-muted-foreground line-clamp-1 text-sm">
                            {row.description}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-muted-foreground flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="whitespace-nowrap">
                          {row.memberCount} {row.memberCount === 1 ? "member" : "members"}
                        </span>
                        {actionCount > 0 ? (
                          <Badge className="bg-primary text-primary-foreground whitespace-nowrap">
                            {actionCount} action{actionCount === 1 ? "" : "s"} needed
                          </Badge>
                        ) : null}
                        {row.pendingRequestCount > 0 ? (
                          <Badge variant="secondary" className="whitespace-nowrap">
                            {row.pendingRequestCount} pending
                          </Badge>
                        ) : null}
                        <ChevronRightIcon className="size-4 shrink-0" />
                      </div>
                    </div>
                  </Card>
                </Link>
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
