import { createLazyFileRoute } from "@tanstack/react-router";

import { ChangelogPage } from "@/features/marketing/components/changelog-page";

export const Route = createLazyFileRoute("/_app/changelog")({
  component: ChangelogRoute,
});

function ChangelogRoute() {
  return <ChangelogPage />;
}
