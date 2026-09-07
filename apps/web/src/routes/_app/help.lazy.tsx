import { createLazyFileRoute } from "@tanstack/react-router";

import { HelpIndexPage } from "@/features/marketing/components/help-index-page";

export const Route = createLazyFileRoute("/_app/help")({
  component: HelpRoute,
});

function HelpRoute() {
  return <HelpIndexPage />;
}
