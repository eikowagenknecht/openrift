import { createLazyFileRoute } from "@tanstack/react-router";

import { CreatorsPage } from "@/components/creators/creators-page";

export const Route = createLazyFileRoute("/_app/creators")({
  component: CreatorsPage,
});
