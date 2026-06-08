import type { FriendGroupDetailResponse, FriendGroupRole } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTradeActionCounts } from "@/hooks/use-card-trades";
import { useDeclineFriendGroupInvite, useFriendGroupDetail } from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { cn, PAGE_PADDING } from "@/lib/utils";

export const ROLE_LABEL: Record<FriendGroupRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const SECTION_HEADING = "text-muted-foreground text-sm font-medium tracking-wide uppercase";

export function isAdmin(role: FriendGroupRole | null): role is "admin" | "owner" {
  return role === "admin" || role === "owner";
}

/** The four navigable group pages, keyed for the sub-nav's active state. */
export type GroupPage = "overview" | "trades" | "shared" | "members";

/**
 * Loads the group, shows the pending-approval stub for would-be members, and
 * otherwise wraps `render(data)` in the shared header + sub-nav shell. Every
 * group page (overview, trades, shared, members) mounts through this.
 * @returns The framed group page, or the pending stub.
 */
export function FriendGroupPageFrame({
  slug,
  active,
  render,
}: {
  slug: string;
  active: GroupPage;
  render: (data: FriendGroupDetailResponse) => ReactNode;
}) {
  const { data } = useFriendGroupDetail(slug);
  if (data.viewerStatus === "pending") {
    return <PendingApprovalStub data={data} />;
  }
  return (
    <FriendGroupShell slug={slug} data={data} active={active}>
      {render(data)}
    </FriendGroupShell>
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

function FriendGroupShell({
  slug,
  data,
  active,
  children,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
  active: GroupPage;
  children: ReactNode;
}) {
  const { data: actionCounts } = useTradeActionCounts();
  const tradesActionCount =
    actionCounts?.byGroup.find((entry) => entry.groupId === data.group.id)?.count ?? 0;
  // `pendingRequests` is only populated for admins/owners, so the badge hides
  // itself for plain members.
  const pendingRequestCount = data.pendingRequests.length;
  const memberCount = data.members.length;

  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", PAGE_PADDING)}>
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <Heading level={1}>{data.group.name}</Heading>
            <p className="text-muted-foreground text-sm">
              {memberCount} {memberCount === 1 ? "member" : "members"}
              {tradesActionCount > 0
                ? ` · ${tradesActionCount} ${tradesActionCount === 1 ? "trade needs" : "trades need"} you`
                : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary">{ROLE_LABEL[data.viewerRole ?? "member"]}</Badge>
            <Button
              size="sm"
              variant="ghost"
              render={<Link to="/groups/$slug/manage" params={{ slug }} />}
            >
              <SettingsIcon className="size-4" />
              Manage
            </Button>
          </div>
        </div>
        {data.group.description ? (
          <p className="text-muted-foreground">{data.group.description}</p>
        ) : null}
      </header>

      <GroupNav
        slug={slug}
        active={active}
        tradesBadge={tradesActionCount}
        membersBadge={pendingRequestCount}
      />

      {children}
    </div>
  );
}

function GroupNav({
  slug,
  active,
  tradesBadge,
  membersBadge,
}: {
  slug: string;
  active: GroupPage;
  tradesBadge: number;
  membersBadge: number;
}) {
  return (
    <nav className="flex gap-1 border-b">
      <GroupNavLink
        to="/groups/$slug"
        slug={slug}
        label="Overview"
        isActive={active === "overview"}
      />
      <GroupNavLink
        to="/groups/$slug/trades"
        slug={slug}
        label="Trades"
        badge={tradesBadge}
        isActive={active === "trades"}
      />
      <GroupNavLink
        to="/groups/$slug/shared"
        slug={slug}
        label="Shared"
        isActive={active === "shared"}
      />
      <GroupNavLink
        to="/groups/$slug/members"
        slug={slug}
        label="Members"
        badge={membersBadge}
        isActive={active === "members"}
      />
    </nav>
  );
}

function GroupNavLink({
  to,
  slug,
  label,
  badge = 0,
  isActive,
}: {
  to: "/groups/$slug" | "/groups/$slug/trades" | "/groups/$slug/shared" | "/groups/$slug/members";
  slug: string;
  label: string;
  badge?: number;
  isActive: boolean;
}) {
  return (
    <Link
      to={to}
      params={{ slug }}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium transition-colors",
        isActive
          ? "border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground border-transparent",
      )}
    >
      {label}
      {badge > 0 ? (
        <span
          aria-label={`${badge} need your action`}
          className="bg-primary text-primary-foreground text-2xs rounded-full px-1.5 font-medium"
        >
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
