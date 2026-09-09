import { Link } from "@tanstack/react-router";

import { Heading } from "@/components/heading";
import { TopBarBreadcrumbBar } from "@/components/layout/top-bar-breadcrumb";
import { ContactSharingPanel } from "@/features/groups/components/contact-sharing-panel";
import { DiscordPanel } from "@/features/groups/components/discord-panel";
import { AdminSettings } from "@/features/groups/components/friend-group-admin-settings";
import { LeaveOrDeletePanel } from "@/features/groups/components/leave-or-delete-panel";
import { ShareableCollectionsPanel } from "@/features/groups/components/shareable-collections-panel";
import { ShareableListsPanel } from "@/features/groups/components/shareable-lists-panel";
import { ShopsPanel } from "@/features/groups/components/shops-panel";
import { useFriendGroupDetail } from "@/features/groups/hooks/use-friend-groups";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

import { isAdmin } from "./friend-group-shell";

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
      <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-6", PAGE_PADDING)}>
        <Heading level={1}>Manage {data.group.name}</Heading>

        {isAdmin(viewerRole) ? <AdminSettings data={data} slug={slug} /> : null}
        {isAdmin(viewerRole) ? <DiscordPanel slug={slug} /> : null}
        {isAdmin(viewerRole) ? <ShopsPanel slug={slug} /> : null}
        <ContactSharingPanel data={data} slug={slug} />
        <ShareableListsPanel slug={slug} />
        <ShareableCollectionsPanel slug={slug} />
        <LeaveOrDeletePanel data={data} slug={slug} />
      </div>
    </>
  );
}
