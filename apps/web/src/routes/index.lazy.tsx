import { createLazyFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/landing/landing-page";

export const Route = createLazyFileRoute("/")({
  component: LandingPage,
});
