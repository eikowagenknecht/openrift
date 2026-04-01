import { createLazyFileRoute } from "@tanstack/react-router";

import { SupportPage } from "@/components/support/support-page";

export const Route = createLazyFileRoute("/_app/support")({
  component: SupportRoute,
});

function SupportRoute() {
  return <SupportPage />;
}
