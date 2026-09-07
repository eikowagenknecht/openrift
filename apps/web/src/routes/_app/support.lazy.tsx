import { createLazyFileRoute } from "@tanstack/react-router";

import { SupportPage } from "@/features/marketing/components/support-page";

export const Route = createLazyFileRoute("/_app/support")({
  component: SupportRoute,
});

function SupportRoute() {
  return <SupportPage />;
}
