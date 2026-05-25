import type { FriendGroupRole } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon, PlusIcon, UsersIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  useAcceptFriendGroupInvite,
  useCreateFriendGroup,
  useDeclineFriendGroupInvite,
  useFriendGroups,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { cn, PAGE_PADDING } from "@/lib/utils";

const ROLE_BADGE: Record<FriendGroupRole, { label: string; className: string }> = {
  owner: { label: "Owner", className: "bg-primary text-primary-foreground" },
  admin: { label: "Admin", className: "bg-secondary text-secondary-foreground" },
  member: { label: "Member", className: "bg-muted text-muted-foreground" },
};

function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const createGroup = useCreateFriendGroup();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [generateCode, setGenerateCode] = useState(true);
  const slugError =
    slug.length > 0 && !/^[a-z0-9][a-z0-9-]+$/u.test(slug)
      ? "Lowercase letters, digits, and dashes; starts with a letter or digit"
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
    void navigate({ to: "/groups/$slug", params: { slug: group.slug } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create friend group</DialogTitle>
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
  const [createOpen, setCreateOpen] = useState(false);
  const acceptInvite = useAcceptFriendGroupInvite();
  const declineInvite = useDeclineFriendGroupInvite();
  const viewerId = useRequiredUserId();

  return (
    <div className={cn("mx-auto flex w-full max-w-4xl flex-col gap-6", PAGE_PADDING)}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Friend groups</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link to="/groups/join" />}>
            Join with code
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            New group
          </Button>
          <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
        </div>
      </div>

      {data.pendingInvites.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Pending invites
          </h2>
          <div className="flex flex-col gap-2">
            {data.pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="bg-card flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{invite.groupName}</span>
                  <span className="text-muted-foreground text-xs">/groups/{invite.groupSlug}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      acceptInvite.mutate({ slug: invite.groupSlug, userId: viewerId })
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
              </div>
            ))}
          </div>
        </section>
      )}

      {data.items.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-3 py-12 text-center">
          <UsersIcon className="size-10" />
          <p>You&apos;re not in any friend groups yet.</p>
          <p className="text-xs">Create one above, or paste an invite code to join.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.items.map((row) => {
            const badge = ROLE_BADGE[row.viewerRole];
            return (
              <Link key={row.id} to="/groups/$slug" params={{ slug: row.slug }} className="block">
                <Card className="hover:bg-accent h-full transition-colors">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="truncate">{row.name}</span>
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </CardTitle>
                    {row.description ? (
                      <CardDescription className="line-clamp-2">{row.description}</CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex items-center justify-between text-sm">
                    <span>
                      {row.memberCount} {row.memberCount === 1 ? "member" : "members"}
                    </span>
                    {row.pendingRequestCount > 0 ? (
                      <Badge variant="secondary">{row.pendingRequestCount} pending</Badge>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
