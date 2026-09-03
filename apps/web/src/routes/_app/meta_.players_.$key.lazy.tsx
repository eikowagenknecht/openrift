import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaPlayerPage } from "@/components/meta/meta-player-page";

export const Route = createLazyFileRoute("/_app/meta_/players_/$key")({
  component: MetaPlayerPage,
});
