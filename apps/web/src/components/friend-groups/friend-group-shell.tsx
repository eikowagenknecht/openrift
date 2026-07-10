import type { FriendGroupDetailResponse, FriendGroupRole } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import {
  PageDescription,
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
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
import { cn, PAGE_PADDING, PAGE_PADDING_NO_TOP } from "@/lib/utils";

export const ROLE_LABEL: Record<FriendGroupRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const SECTION_HEADING = "text-muted-foreground text-sm font-medium tracking-wide uppercase";

export function isAdmin(role: FriendGroupRole | null): role is "admin" | "owner" {
  return role === "admin" || role === "owner";
}

/**
 * Group-level access to the group's tournaments surface. ADR-033 retired the
 * `judge` group role and moved judging to tournament_staff; the group owner/admin
 * still reach the group's tournaments, and per-action authority is enforced
 * server-side against the tournament host/staff.
 * @returns True for owner and admin.
 */
export function canManageGroupTournaments(role: FriendGroupRole | null): role is "admin" | "owner" {
  return role === "admin" || role === "owner";
}

/**
 * The group overview frame: loads the group, shows the pending-approval stub
 * for would-be members, and otherwise renders the group header (name + Manage)
 * and description above `render(data)`. Only the overview mounts through this;
 * the section pages (trades / shared / members / events) use
 * {@link FriendGroupSectionFrame}.
 * @returns The framed overview, or the pending stub.
 */
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
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar>
          <PageTopBarTitle>{data.group.name}</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarButton render={<Link to="/groups/$slug/manage" params={{ slug }} />}>
              <SettingsIcon className="size-4" />
              Manage
            </PageTopBarButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        {data.group.description ? (
          <header>
            <PageDescription>{data.group.description}</PageDescription>
          </header>
        ) : null}
        {render(data)}
      </div>
    </>
  );
}

/**
 * Frame for a group section page (trades, shared, members, events): loads the
 * group, shows the pending stub, and otherwise renders the section's title as
 * the big page heading *inside* the drill-down bar (`Group / <Title>`), matching
 * the collection/list drill-down pages. Sections are reached from the overview
 * tiles and navigated back via the breadcrumb, which collapses to a single back
 * arrow on phones — replacing the old horizontal tab bar.
 * @returns The framed section page, or the pending stub.
 */
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
      <PageTopBarSticky maxWidth="5xl">
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
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        {render(data)}
      </div>
    </>
  );
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
