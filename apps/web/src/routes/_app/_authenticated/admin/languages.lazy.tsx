import { createLazyFileRoute } from "@tanstack/react-router";

import { LanguagesPage } from "@/components/admin/languages-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/languages")({
  component: LanguagesPage,
});
