import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaSubmitPage } from "@/components/meta/meta-submit-page";

export const Route = createLazyFileRoute("/_app/_authenticated/meta_/submit")({
  component: MetaSubmitRoute,
});

function MetaSubmitRoute() {
  return <MetaSubmitPage />;
}
