import { createLazyFileRoute } from "@tanstack/react-router";

import { HelpIndexPage } from "@/components/help/help-index-page";
import { Footer } from "@/components/layout/footer";

export const Route = createLazyFileRoute("/_app/help")({
  component: HelpRoute,
});

function HelpRoute() {
  return (
    <>
      <HelpIndexPage />
      <Footer />
    </>
  );
}
