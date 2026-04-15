import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminCardDetailQueryOptions } from "@/hooks/use-admin-card-queries";
import { initQueryOptions } from "@/hooks/use-init";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";
import { adminPromoTypesQueryOptions } from "@/hooks/use-promo-types";
import { setsQueryOptions } from "@/hooks/use-sets";

export const Route = createFileRoute(
  "/_app/_authenticated/admin/cards_/$cardSlug_/printings/create",
)({
  staticData: { title: "Create Printing" },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(adminCardDetailQueryOptions(params.cardSlug)),
      context.queryClient.ensureQueryData(setsQueryOptions),
      context.queryClient.ensureQueryData(adminPromoTypesQueryOptions),
      context.queryClient.ensureQueryData(adminLanguagesQueryOptions),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
