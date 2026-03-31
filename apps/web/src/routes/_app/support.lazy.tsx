import { createLazyFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/layout/footer";
import { SupportPage } from "@/components/support/support-page";

export const Route = createLazyFileRoute("/_app/support")({
  component: SupportRoute,
});

function SupportRoute() {
  return (
    <>
      <SupportPage />
      <Footer />
    </>
  );
}
