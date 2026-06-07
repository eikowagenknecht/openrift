import { createLazyFileRoute } from "@tanstack/react-router";

import { MatchTrackerPage } from "@/components/match-tracker/match-tracker-page";

export const Route = createLazyFileRoute("/_app/match-tracker")({
  component: MatchTrackerPage,
});
