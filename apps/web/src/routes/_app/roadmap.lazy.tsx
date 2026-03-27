import { createLazyFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/layout/footer";
import { RoadmapPage } from "@/components/roadmap/roadmap-page";

export const Route = createLazyFileRoute("/_app/roadmap")({
  component: RoadmapRoute,
});

function RoadmapRoute() {
  return (
    <>
      <RoadmapPage />
      <Footer />
    </>
  );
}
