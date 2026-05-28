import { createLazyFileRoute } from "@tanstack/react-router";

import { FriendGroupPage } from "@/components/friend-groups/friend-group-page";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug")({
  component: GroupDetailRoute,
});

function GroupDetailRoute() {
  const { slug } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <FriendGroupPage
      slug={slug}
      tab={tab}
      onTabChange={(next) =>
        void navigate({ search: (prev) => ({ ...prev, tab: next }), replace: true })
      }
    />
  );
}
