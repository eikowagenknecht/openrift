import { createLazyFileRoute } from "@tanstack/react-router";

import { MySubmissionsPage } from "@/components/contribute/my-submissions-page";

export const Route = createLazyFileRoute("/_app/contribute_/submissions")({
  component: MySubmissionsPage,
});
