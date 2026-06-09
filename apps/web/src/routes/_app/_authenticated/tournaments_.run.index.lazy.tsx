import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentsIndexPage } from "@/components/pod-tournaments/tournaments-index-page";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/run/")({
  component: TournamentsIndexPage,
});
