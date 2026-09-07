import { createLazyFileRoute } from "@tanstack/react-router";

import { LanguagesPage } from "@/features/admin/components/languages-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/languages")({
  component: LanguagesPage,
});
