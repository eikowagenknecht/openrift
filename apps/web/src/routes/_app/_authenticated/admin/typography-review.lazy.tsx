import { createLazyFileRoute } from "@tanstack/react-router";

import { TypographyReviewPage } from "@/components/admin/typography-review-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/typography-review")({
  component: TypographyReviewPage,
});
