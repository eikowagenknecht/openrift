import { createLazyFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { LandingPage } from "@/features/marketing/components/landing-page";
import { FOOTER_PADDING_NO_TOP } from "@/lib/utils";

export const Route = createLazyFileRoute("/")({
  component: LandingRoute,
});

// Outside `_app` so the hero gradient spans the full viewport width; it composes
// the header and footer itself. Only signed-out visitors reach it.
function LandingRoute() {
  return (
    <>
      <Header />
      <LandingPage />
      <Footer className={FOOTER_PADDING_NO_TOP} />
    </>
  );
}
