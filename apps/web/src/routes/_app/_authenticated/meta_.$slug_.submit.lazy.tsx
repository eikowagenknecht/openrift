import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaSubmitPage } from "@/components/meta/meta-submit-page";

export const Route = createLazyFileRoute("/_app/_authenticated/meta_/$slug_/submit")({
  component: MetaEventSubmitRoute,
});

function MetaEventSubmitRoute() {
  const { slug } = Route.useParams();
  return <MetaSubmitPage slug={slug} />;
}
