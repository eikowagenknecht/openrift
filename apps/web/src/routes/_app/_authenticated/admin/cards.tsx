import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminCardListQueryOptions, allCardsQueryOptions } from "@/hooks/use-admin-card-queries";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";
import { unifiedMappingsQueryOptions } from "@/hooks/use-unified-mappings";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/cards")({
  staticData: { title: "Cards" },
  head: () => adminSeoHead("Cards"),
  validateSearch: z.object({
    set: z.string().optional(),
    tab: z.enum(["cards", "candidates", "unmatched"]).optional(),
    q: z.string().optional(),
    sort: z.string().optional(),
    status: z.enum(["unchecked"]).optional(),
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(adminCardListQueryOptions),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions),
      context.queryClient.ensureQueryData(allCardsQueryOptions),
      context.queryClient.ensureQueryData(unifiedMappingsQueryOptions(true)),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
