import { createLazyFileRoute } from "@tanstack/react-router";

import { GroupsJoinPage } from "@/features/groups/components/groups-join-page";

export const Route = createLazyFileRoute("/_app/groups_/join")({
  component: JoinRoute,
});

function JoinRoute() {
  const { code } = Route.useSearch();
  return <GroupsJoinPage code={code} />;
}
