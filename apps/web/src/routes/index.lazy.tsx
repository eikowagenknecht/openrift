import { createLazyFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/landing/landing-page";
import { Footer } from "@/components/layout/footer";

export const Route = createLazyFileRoute("/")({
  component: LandingRoute,
});

function LandingRoute() {
  return (
    <>
      <LandingPage />
      <Footer />
    </>
  );
}
