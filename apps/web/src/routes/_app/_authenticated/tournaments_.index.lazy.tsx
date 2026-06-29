import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentsListPage } from "@/components/tournaments/tournaments-list-page";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/")({
  component: TournamentsListPage,
});
