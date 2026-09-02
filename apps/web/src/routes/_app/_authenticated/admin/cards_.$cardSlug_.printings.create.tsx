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
