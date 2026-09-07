import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaLegendsPage } from "@/features/meta/components/meta-legends-page";

export const Route = createLazyFileRoute("/_app/meta_/legends")({
  component: MetaLegendsPage,
});
