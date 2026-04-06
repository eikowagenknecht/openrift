import { createLazyFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/landing/landing-page";
import { Footer } from "@/components/layout/footer";
import { FOOTER_PADDING_NO_TOP } from "@/lib/utils";

export const Route = createLazyFileRoute("/")({
  component: LandingRoute,
});

function LandingRoute() {
  return (
    <>
      <LandingPage />
      <Footer className={FOOTER_PADDING_NO_TOP} />
    </>
  );
}
