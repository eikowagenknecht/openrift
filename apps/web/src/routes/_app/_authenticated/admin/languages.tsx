import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/languages")({
  staticData: { title: "Languages" },
  head: () => adminSeoHead("Languages"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminLanguagesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
