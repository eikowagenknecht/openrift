import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminCardDetailQueryOptions } from "@/features/admin/hooks/use-admin-card-queries";
import { setsQueryOptions } from "@/features/cards/hooks/use-sets";
import { initQueryOptions } from "@/hooks/use-init";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";
import { adminMarkersQueryOptions } from "@/hooks/use-markers";
import { adminSeoHead } from "@/lib/seo";

interface CreatePrintingSearch {
  duplicateFrom?: string;
}

export const Route = createFileRoute(
  "/_app/_authenticated/admin/cards_/$cardSlug_/printings/create",
)({
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
      context.queryClient.query({
        ...adminCardDetailQueryOptions(params.cardSlug),
        staleTime: "static",
      }),
      context.queryClient.query({ ...setsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminMarkersQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminLanguagesQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
