import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaSubmitPage } from "@/features/meta/components/meta-submit-page";

export const Route = createLazyFileRoute("/_app/_authenticated/meta_/submit")({
  component: MetaSubmitRoute,
});

function MetaSubmitRoute() {
  return <MetaSubmitPage />;
}
