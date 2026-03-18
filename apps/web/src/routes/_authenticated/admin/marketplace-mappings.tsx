import { createFileRoute } from "@tanstack/react-router";

import { unifiedMappingsQueryOptions } from "@/hooks/use-unified-mappings";

export const Route = createFileRoute("/_authenticated/admin/marketplace-mappings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(unifiedMappingsQueryOptions()),
});
