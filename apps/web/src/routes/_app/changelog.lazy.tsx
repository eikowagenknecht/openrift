import { createLazyFileRoute } from "@tanstack/react-router";

import { ChangelogPage } from "@/components/changelog/changelog-page";

export const Route = createLazyFileRoute("/_app/changelog")({
  component: ChangelogPage,
});
