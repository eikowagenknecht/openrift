import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminAccessQueryOptions } from "@/features/admin/hooks/use-admin";
import {
  adminCardListQueryOptions,
  allCardsQueryOptions,
} from "@/features/admin/hooks/use-admin-card-queries";
import { providerSettingsQueryOptions } from "@/features/admin/hooks/use-provider-settings";
import { unifiedMappingsQueryOptions } from "@/features/admin/hooks/use-unified-mappings";
import { setsQueryOptions } from "@/features/cards/hooks/use-sets";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/cards")({
  head: () => adminSeoHead("Cards"),
  validateSearch: z.object({
    set: z.string().optional(),
    tab: z.enum(["cards", "candidates", "unmatched"]).optional(),
    q: z.string().optional(),
    tableSort: z.string().optional(),
    status: z.enum(["unchecked", "new-printings", "prices-to-assign"]).optional(),
    // Source+language scope for the "prices to assign" filter, e.g. "cardmarket"
    // or "cardtrader:FR". Only meaningful while `status` is "prices-to-assign".
    priceScope: z.string().optional(),
    // When "usersubmission", the candidates tab shows only groups that
    // include an in-app user submission. Composes with `status`.
    source: z.enum(["usersubmission"]).optional(),
  }),
  loader: async ({ context }) => {
    // Unified mappings are a marketplace endpoint that card-review grant
    // holders cannot reach; only prefetch it for full admins.
    const access = await context.queryClient.query({
      ...adminAccessQueryOptions(context.userId),
      staleTime: "static",
    });
    await Promise.all([
      context.queryClient.query({ ...adminCardListQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...providerSettingsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...allCardsQueryOptions, staleTime: "static" }),
      ...(access.isAdmin
        ? [context.queryClient.query({ ...unifiedMappingsQueryOptions(), staleTime: "static" })]
        : []),
      context.queryClient.query({ ...setsQueryOptions, staleTime: "static" }),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
