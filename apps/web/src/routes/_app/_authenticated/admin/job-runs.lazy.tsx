import { createLazyFileRoute } from "@tanstack/react-router";

import { JobRunsPage } from "@/features/admin/components/job-runs-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/job-runs")({
  component: JobRunsPage,
});
