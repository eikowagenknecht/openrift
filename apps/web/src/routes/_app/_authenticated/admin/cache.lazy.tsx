import { createLazyFileRoute } from "@tanstack/react-router";

import { CachePage } from "@/features/admin/components/cache-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/cache")({
  component: CachePage,
});
