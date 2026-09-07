import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentsListPage } from "@/features/tournaments/components/tournaments-list-page";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/")({
  component: TournamentsListPage,
});
