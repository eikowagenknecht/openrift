import { createLazyFileRoute } from "@tanstack/react-router";

import { MatchTrackerPage } from "@/features/match-tracker/components/match-tracker-page";

export const Route = createLazyFileRoute("/_app/match-tracker")({
  component: MatchTrackerPage,
});
