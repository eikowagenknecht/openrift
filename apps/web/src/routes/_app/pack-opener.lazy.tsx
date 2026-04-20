import { createLazyFileRoute } from "@tanstack/react-router";

import { PackOpenerPage } from "@/components/pack-opener/pack-opener-page";

export const Route = createLazyFileRoute("/_app/pack-opener")({
  component: PackOpenerPage,
});
