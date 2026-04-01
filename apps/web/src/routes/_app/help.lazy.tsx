import { createLazyFileRoute } from "@tanstack/react-router";

import { HelpIndexPage } from "@/components/help/help-index-page";

export const Route = createLazyFileRoute("/_app/help")({
  component: HelpRoute,
});

function HelpRoute() {
  return <HelpIndexPage />;
}
