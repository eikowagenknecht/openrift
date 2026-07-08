import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminAccessQueryOptions } from "@/hooks/use-admin";
import { adminCardListQueryOptions, allCardsQueryOptions } from "@/hooks/use-admin-card-queries";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";
import { setsQueryOptions } from "@/hooks/use-sets";
import { unifiedMappingsQueryOptions } from "@/hooks/use-unified-mappings";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/cards")({
  head: () => adminSeoHead("Cards"),
  validateSearch: z.object({
    set: z.string().optional(),
    tab: z.enum(["cards", "candidates", "unmatched"]).optional(),
    q: z.string().optional(),
    tableSort: z.string().optional(),
    status: z.enum(["unchecked", "prices-to-assign"]).optional(),
    // Source+language scope for the "prices to assign" filter, e.g. "cardmarket"
    // or "cardtrader:FR". Absent means all assignable buckets. Only meaningful
    // while `status` is "prices-to-assign".
    priceScope: z.string().optional(),
    // ADR-036: when "usersubmission", the candidates tab shows only groups that
    // include an in-app user submission. Composes with `status`.
    source: z.enum(["usersubmission"]).optional(),
  }),
  loader: async ({ context }) => {
    // Already warm from the admin layout beforeLoad. Unified mappings are a
    // marketplace endpoint that card-review grant holders cannot reach — only
    // prefetch it for full admins.
    const access = await context.queryClient.ensureQueryData(
      adminAccessQueryOptions(context.userId),
    );
    await Promise.all([
      context.queryClient.ensureQueryData(adminCardListQueryOptions),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions),
      context.queryClient.ensureQueryData(allCardsQueryOptions),
      ...(access.isAdmin
        ? [context.queryClient.ensureQueryData(unifiedMappingsQueryOptions())]
        : []),
      context.queryClient.ensureQueryData(setsQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
