import { createLazyFileRoute } from "@tanstack/react-router";

import { GroupsIndexPage } from "@/features/groups/components/groups-index-page";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/")({
  component: GroupsIndexPage,
});
