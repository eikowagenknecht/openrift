import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";

import { PageTopBarButton } from "@/components/layout/page-top-bar";
import { FriendGroupSectionFrame, isAdmin } from "@/features/groups/components/friend-group-shell";
import { ShopEventsContent } from "@/features/groups/components/shop-events-page";
import { useFriendGroupDetail } from "@/features/groups/hooks/use-friend-groups";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/shops")({
  component: GroupShopEventsRoute,
});

function GroupShopEventsRoute() {
  const { slug } = Route.useParams();
  const { data } = useFriendGroupDetail(slug);
  return (
    <FriendGroupSectionFrame
      slug={slug}
      title="Shop events"
      actions={
        isAdmin(data.viewerRole) ? (
          <PageTopBarButton
            render={<Link to="/groups/$slug/manage" params={{ slug }} hash="shops" />}
          >
            <SettingsIcon className="size-4" />
            Manage shops
          </PageTopBarButton>
        ) : null
      }
      render={(detail) => <ShopEventsContent slug={slug} data={detail} />}
    />
  );
}
