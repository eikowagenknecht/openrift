import { createLazyFileRoute } from "@tanstack/react-router";

import { JobRunsPage } from "@/components/admin/job-runs-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/job-runs")({
  component: JobRunsPage,
});
