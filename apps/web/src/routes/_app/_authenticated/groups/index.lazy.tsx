import { createLazyFileRoute } from "@tanstack/react-router";

import { GroupsIndexPage } from "@/components/friend-groups/groups-index-page";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/")({
  component: GroupsIndexPage,
});
