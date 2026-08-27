import type { FriendGroupJoinPreviewResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { SignedOutAuthButtons } from "@/components/signed-out-cta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  friendGroupJoinPreviewQueryOptions,
  useJoinFriendGroupByCode,
} from "@/hooks/use-friend-groups";
import { useUserId } from "@/lib/auth-session";
import { cn, PAGE_PADDING } from "@/lib/utils";

interface GroupsJoinPageProps {
  initialCode?: string;
}

/**
 * The request button, split out because `useJoinFriendGroupByCode` requires a
 * signed-in user and this page is reachable without one.
 *
 * @returns The join action.
 */
function JoinAction({
  code,
  preview,
  previewLoading,
}: {
  code: string;
  preview?: FriendGroupJoinPreviewResponse;
  previewLoading: boolean;
}) {
  const navigate = useNavigate();
  const joinByCode = useJoinFriendGroupByCode();

  async function handleSubmit() {
    if (!code) {
      return;
    }
    if (preview?.viewerStatus === "member") {
      void navigate({ to: "/groups/$slug", params: { slug: preview.slug } });
      return;
    }
    await joinByCode.mutateAsync(code);
    if (preview?.slug) {
      void navigate({ to: "/groups/$slug", params: { slug: preview.slug } });
    } else {
      void navigate({ to: "/groups" });
    }
  }

  return (
    <div className="flex justify-between gap-3">
      <Button variant="ghost" render={<Link to="/groups" />}>
        Cancel
      </Button>
      <Button onClick={handleSubmit} disabled={!code || previewLoading || joinByCode.isPending}>
        {preview?.viewerStatus === "member"
          ? "Open group"
          : preview?.viewerStatus === "pending"
            ? "Already requested"
            : "Request to join"}
      </Button>
    </div>
  );
}

export function GroupsJoinPage({ initialCode }: GroupsJoinPageProps) {
  const [code, setCode] = useState(initialCode ?? "");
  const userId = useUserId();
  const preview = useQuery(friendGroupJoinPreviewQueryOptions(code));

  return (
    <div className={cn("mx-auto flex w-full max-w-md flex-col gap-6", PAGE_PADDING)}>
      <div className="flex flex-col gap-2">
        <Heading level={1}>Join a group</Heading>
        <p className="text-muted-foreground text-sm">
          Join requests go to the group&apos;s admins for approval.
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
            <CardTitle>No group found</CardTitle>
            <CardDescription>That code doesn&apos;t match any group.</CardDescription>
          </CardHeader>
        </Card>
      ) : preview.data ? (
        <Card>
          <CardHeader>
            <CardTitle>{preview.data.name}</CardTitle>
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

      {userId ? (
        <JoinAction code={code} preview={preview.data} previewLoading={preview.isLoading} />
      ) : preview.data ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Sign in to send your request. The group&apos;s admins approve it from there.
          </p>
          <SignedOutAuthButtons signInLabel="Sign in to request" />
        </div>
      ) : null}
    </div>
  );
}
