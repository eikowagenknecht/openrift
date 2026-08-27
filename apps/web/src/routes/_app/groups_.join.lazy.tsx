import { createLazyFileRoute } from "@tanstack/react-router";

import { GroupsJoinPage } from "@/components/friend-groups/groups-join-page";

export const Route = createLazyFileRoute("/_app/groups_/join")({
  component: JoinRoute,
});

function JoinRoute() {
  const { code } = Route.useSearch();
  return <GroupsJoinPage initialCode={code} />;
}
