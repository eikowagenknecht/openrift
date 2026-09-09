import { createLazyFileRoute } from "@tanstack/react-router";

import { ContributeChooser } from "@/features/contribute/components/contribute-chooser";

export const Route = createLazyFileRoute("/_app/contribute")({
  component: ContributeChooser,
});
