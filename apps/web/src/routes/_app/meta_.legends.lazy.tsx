import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaLegendsPage } from "@/components/meta/meta-legends-page";

export const Route = createLazyFileRoute("/_app/meta_/legends")({
  component: MetaLegendsPage,
});
