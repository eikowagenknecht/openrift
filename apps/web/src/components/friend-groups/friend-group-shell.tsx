import type { FriendGroupDetailResponse, FriendGroupRole } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { FriendGroupHero } from "@/components/friend-groups/friend-group-hero";
import { Heading } from "@/components/heading";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import {
  TopBarBreadcrumbSeparator,
  TopBarBreadcrumbTrail,
} from "@/components/layout/top-bar-breadcrumb";
import { Button } from "@/components/ui/button";
import { useDeclineFriendGroupInvite, useFriendGroupDetail } from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { cn, PAGE_PADDING, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

export const ROLE_LABEL: Record<FriendGroupRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function isAdmin(role: FriendGroupRole | null): role is "admin" | "owner" {
  return role === "admin" || role === "owner";
}

export function FriendGroupPageFrame({
  slug,
  render,
}: {
  slug: string;
  render: (data: FriendGroupDetailResponse) => ReactNode;
}) {
  const { data } = useFriendGroupDetail(slug);
  if (data.viewerStatus === "pending") {
    return <PendingApprovalStub data={data} />;
  }
  return (
    <>
      <FriendGroupHero slug={slug} data={data} />
      <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-6 pt-6", PAGE_PADDING_NO_TOP)}>
        {render(data)}
      </div>
    </>
  );
}

export function FriendGroupSectionFrame({
  slug,
  title,
  actions,
  render,
}: {
  slug: string;
  title: string;
  actions?: ReactNode;
  render: (data: FriendGroupDetailResponse) => ReactNode;
}) {
  const { data } = useFriendGroupDetail(slug);
  if (data.viewerStatus === "pending") {
    return <PendingApprovalStub data={data} />;
  }
  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:items-baseline">
            <TopBarBreadcrumbTrail
              segments={[
                { label: data.group.name, link: <Link to="/groups/$slug" params={{ slug }} /> },
              ]}
            />
            <TopBarBreadcrumbSeparator className="hidden sm:inline" />
            <PageTopBarTitle>{title}</PageTopBarTitle>
          </div>
          {actions ? <PageTopBarActions>{actions}</PageTopBarActions> : null}
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        {render(data)}
      </div>
    </>
  );
}

function PendingApprovalStub({ data }: { data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const declineInvite = useDeclineFriendGroupInvite();
  const navigate = useNavigate();

  async function handleCancel() {
    try {
      await declineInvite.mutateAsync({ slug: data.group.slug, userId: viewerId });
      void navigate({ to: "/groups" });
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  return (
    <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-4 text-center", PAGE_PADDING)}>
      <Heading level={1}>{data.group.name}</Heading>
      <p className="text-muted-foreground">Waiting for an admin to approve your request to join.</p>
      <Button
        variant="ghost"
        onClick={() => void handleCancel()}
        disabled={declineInvite.isPending}
      >
        Cancel request
      </Button>
    </div>
  );
}
