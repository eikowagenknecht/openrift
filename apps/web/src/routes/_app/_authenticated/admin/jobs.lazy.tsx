import { createLazyFileRoute } from "@tanstack/react-router";

import { JobSchedulesPage } from "@/components/admin/job-schedules-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/jobs")({
  component: JobSchedulesPage,
});
