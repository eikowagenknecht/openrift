import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaEventPage } from "@/features/meta/components/meta-event-page";

export const Route = createLazyFileRoute("/_app/meta_/$slug")({
  component: MetaEventRoute,
});

function MetaEventRoute() {
  const { slug } = Route.useParams();
  return <MetaEventPage slug={slug} />;
}
