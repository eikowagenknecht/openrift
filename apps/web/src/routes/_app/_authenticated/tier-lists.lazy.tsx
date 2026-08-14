import { createLazyFileRoute } from "@tanstack/react-router";

import { TierListIndexPage } from "@/components/tier-lists/tier-list-index-page";

export const Route = createLazyFileRoute("/_app/_authenticated/tier-lists")({
  component: TierListIndexPage,
});
