import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminCardDetailQueryOptions } from "@/hooks/use-admin-card-queries";
import { initQueryOptions } from "@/hooks/use-init";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";
import { adminMarkersQueryOptions } from "@/hooks/use-markers";
import { setsQueryOptions } from "@/hooks/use-sets";
import { adminSeoHead } from "@/lib/seo";

interface CreatePrintingSearch {
  duplicateFrom?: string;
}

export const Route = createFileRoute(
  "/_app/_authenticated/admin/cards_/$cardSlug_/printings/create",
)({
  staticData: { title: "Create Printing" },
  head: () => adminSeoHead("Create Printing"),
  validateSearch: (search: Record<string, unknown>): CreatePrintingSearch => {
    const result: CreatePrintingSearch = {};
    if (typeof search.duplicateFrom === "string" && search.duplicateFrom.length > 0) {
      result.duplicateFrom = search.duplicateFrom;
    }
    return result;
  },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(adminCardDetailQueryOptions(params.cardSlug)),
      context.queryClient.ensureQueryData(setsQueryOptions),
      context.queryClient.ensureQueryData(adminMarkersQueryOptions),
      context.queryClient.ensureQueryData(adminLanguagesQueryOptions),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
