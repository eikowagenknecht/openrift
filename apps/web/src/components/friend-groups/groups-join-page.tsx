import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  friendGroupJoinPreviewQueryOptions,
  useJoinFriendGroupByCode,
} from "@/hooks/use-friend-groups";
import { cn, PAGE_PADDING } from "@/lib/utils";

interface GroupsJoinPageProps {
  initialCode?: string;
}

export function GroupsJoinPage({ initialCode }: GroupsJoinPageProps) {
  const [code, setCode] = useState(initialCode ?? "");
  const navigate = useNavigate();
  const joinByCode = useJoinFriendGroupByCode();
  const preview = useQuery(friendGroupJoinPreviewQueryOptions(code));

  async function handleSubmit() {
    if (!code) {
      return;
    }
    if (preview.data?.viewerStatus === "member") {
      void navigate({ to: "/groups/$slug", params: { slug: preview.data.slug } });
      return;
    }
    await joinByCode.mutateAsync(code);
    if (preview.data?.slug) {
      void navigate({ to: "/groups/$slug", params: { slug: preview.data.slug } });
    } else {
      void navigate({ to: "/groups" });
    }
  }

  return (
    <div className={cn("mx-auto flex w-full max-w-md flex-col gap-6", PAGE_PADDING)}>
      <div className="flex flex-col gap-2">
        <Heading level={1}>Join a group</Heading>
        <p className="text-muted-foreground text-sm">
          Paste the invite code an admin shared with you. Your join request goes to the group&apos;s
          admins for approval.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fg-join-code">Invite code</Label>
        <Input
          id="fg-join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          placeholder="XXXXXXXXXXXX"
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the join page exists for one purpose: paste a code. Auto-focus is the right behavior.
          autoFocus
        />
      </div>

      {preview.isError ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No group found</CardTitle>
            <CardDescription>
              That code doesn&apos;t match any group. Double-check with the admin who sent it to
              you.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : preview.data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{preview.data.name}</CardTitle>
            <CardDescription>
              {preview.data.memberCount}
              {preview.data.memberCount === 1 ? " member" : " members"}
            </CardDescription>
          </CardHeader>
          {preview.data.description ? (
            <CardContent className="text-muted-foreground text-sm">
              {preview.data.description}
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <div className="flex justify-between gap-3">
        <Button variant="ghost" render={<Link to="/groups" />}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!code || preview.isLoading || joinByCode.isPending}
        >
          {preview.data?.viewerStatus === "member"
            ? "Open group"
            : preview.data?.viewerStatus === "pending"
              ? "Already requested"
              : "Request to join"}
        </Button>
      </div>
    </div>
  );
}
