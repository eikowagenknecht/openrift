import { createLazyFileRoute } from "@tanstack/react-router";

import { MemberDetailPage } from "@/components/friend-groups/member-detail-page";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/members_/$userId")({
  component: MemberDetailRoute,
});

function MemberDetailRoute() {
  const { slug, userId } = Route.useParams();
  return <MemberDetailPage slug={slug} userId={userId} />;
}
