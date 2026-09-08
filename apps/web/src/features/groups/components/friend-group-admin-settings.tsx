import type { FriendGroupDetailResponse } from "@openrift/shared/types/api/friend-group";
import { useNavigate } from "@tanstack/react-router";
import { KeyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { InviteLinkPanel } from "@/features/groups/components/invite-link-panel";
import {
  useEnableFriendGroupCode,
  useUpdateFriendGroup,
} from "@/features/groups/hooks/use-friend-group-mutations";
import { groupSlugError } from "@/features/groups/lib/group-slug";
import { useServerSeededState } from "@/hooks/use-server-seeded-state";

export function AdminSettings({ data, slug }: { data: FriendGroupDetailResponse; slug: string }) {
  const navigate = useNavigate();
  const update = useUpdateFriendGroup();
  const enableCode = useEnableFriendGroupCode();

  const [name, setName] = useServerSeededState(data.group.name);
  const [description, setDescription] = useServerSeededState(data.group.description ?? "");
  const [newSlug, setNewSlug] = useServerSeededState(data.group.slug);

  const trimmedName = name.trim();
  const trimmedSlug = newSlug.trim();
  const slugChanged = newSlug !== data.group.slug;
  const nameError = trimmedName.length === 0 ? "Give the group a name" : null;
  const slugError = trimmedSlug.length === 0 ? "Pick a web address" : groupSlugError(trimmedSlug);

  async function handleSave() {
    if (nameError || slugError) {
      return;
    }
    const trimmedDescription = description.trim();
    const payload = {
      slug,
      name: trimmedName === data.group.name ? undefined : trimmedName,
      description:
        trimmedDescription === (data.group.description ?? "")
          ? undefined
          : trimmedDescription || null,
      newSlug: slugChanged ? trimmedSlug : undefined,
    };
    try {
      const result = await update.mutateAsync(payload);
      if (slugChanged) {
        void navigate({ to: "/groups/$slug/manage", params: { slug: result.slug } });
      }
    } catch {
      /* Reported by the global mutation error toast. */
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
          {nameError ? <span className="text-destructive text-xs">{nameError}</span> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fg-edit-slug">Slug</Label>
          <Input
            id="fg-edit-slug"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
            maxLength={30}
          />
          {slugError ? <span className="text-destructive text-xs">{slugError}</span> : null}
          {slugChanged && !slugError ? (
            <span className="text-warning text-xs">
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
          <span className="text-muted-foreground text-xs">
            Markdown works here: bold, links, and lists.
          </span>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => void handleSave()}
            disabled={update.isPending || nameError !== null || slugError !== null}
          >
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
