import { createLazyFileRoute } from "@tanstack/react-router";

import { RoadmapPage } from "@/components/roadmap/roadmap-page";

export const Route = createLazyFileRoute("/roadmap")({
  component: RoadmapPage,
});
