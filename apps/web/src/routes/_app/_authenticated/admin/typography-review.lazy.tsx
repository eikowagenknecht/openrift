import { createLazyFileRoute } from "@tanstack/react-router";

import { TypographyReviewPage } from "@/features/admin/components/typography-review-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/typography-review")({
  component: TypographyReviewPage,
});
