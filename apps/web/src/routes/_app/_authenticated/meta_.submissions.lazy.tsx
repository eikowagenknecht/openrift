import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaSubmissionsPage } from "@/components/meta/meta-submissions-page";

export const Route = createLazyFileRoute("/_app/_authenticated/meta_/submissions")({
  component: MetaSubmissionsPage,
});
