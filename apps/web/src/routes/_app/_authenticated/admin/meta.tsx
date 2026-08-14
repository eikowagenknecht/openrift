import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminMetaEventsQueryOptions } from "@/hooks/use-admin-meta";
import { adminMetaCandidatesQueryOptions } from "@/hooks/use-admin-meta-candidates";
import { initQueryOptions } from "@/hooks/use-init";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/meta")({
  head: () => adminSeoHead("Meta Archive"),
  validateSearch: z.object({
    // Absent means the live archive; the candidate queue is the opt-in tab.
    tab: z.enum(["events", "candidates"]).optional(),
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(adminMetaEventsQueryOptions),
      // The Candidates tab label carries the pending count, so the queue is
      // needed on both tabs.
      context.queryClient.ensureQueryData(adminMetaCandidatesQueryOptions),
      // The tables render format labels from /init.
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
